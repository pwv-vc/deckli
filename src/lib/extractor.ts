import { chromium } from "playwright";
import type { DeckInfo } from "./types.js";
import {
  EmailGateError,
  ExtractionError,
  InvalidURLError,
} from "./types.js";
import { getBrowserProfileDir, hasBrowserProfile } from "./storage.js";

// Allow any subdomain (e.g. docsend.com, dbx.docsend.com, aurachatai.docsend.com). Support /view/SLUG and /view/s/SLUG.
const DOCSEND_URL_PATTERN =
  /^https?:\/\/(?:[a-zA-Z0-9-]+\.)?docsend\.com\/(?:view\/(?:s\/)?([a-zA-Z0-9]+)|v\/([a-zA-Z0-9]+)\/([a-zA-Z0-9-]+))/;
const VIEW_SLUG_PATTERN = /\/view\/(?:s\/)?([a-zA-Z0-9]+)/;
const PAGE_DATA_BATCH_SIZE = 10;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// IIFE so page.evaluate(string) returns the result object, not the function (functions don't serialize)
/** Exported for tests: script must be an IIFE so evaluate() returns the object, not the function. */
export const EXTRACT_INFO_JS = `(function() {
  const items = document.querySelectorAll('.carousel-inner .item');
  const slideCount = items.length;
  let title = '';
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) {
    const og = ogTitle.getAttribute('content') || '';
    if (og && !og.toLowerCase().includes('docsend')) title = og;
  }
  if (!title) {
    const dt = document.title.replace(/\\s*[-\\u2013|]\\s*DocSend.*/i, '').trim();
    if (dt && !dt.toLowerCase().includes('docsend')) title = dt;
  }
  if (!title) {
    const viewMatch = window.location.pathname.match(/\\/view\\/([a-zA-Z0-9]+)/);
    if (viewMatch) title = 'docsend-' + viewMatch[1];
    else {
      const vMatch = window.location.pathname.match(/\\/v\\/[^/]+\\/([a-zA-Z0-9-]+)/);
      if (vMatch) title = 'docsend-' + vMatch[1];
    }
  }
  return { slideCount, title };
})()`;

/** Run in browser via page.evaluate(fn, arg) so the argument is passed (string scripts don't receive args). */
async function extractBatchInPage(params: {
  slug: string;
  batchStart: number;
  batchEnd: number;
}): Promise<{ urls: { index: number; url: string | null }[]; errors: string[] }> {
  const { slug, batchStart, batchEnd } = params;
  const ts = Math.floor(Date.now() / 1000);
  const promises: Promise<{ index: number; url: string | null; error?: string }>[] = [];
  for (let i = batchStart; i < batchEnd; i++) {
    promises.push(
      fetch(
        `/view/${slug}/page_data/${i + 1}?timezoneOffset=-21600&viewLoadTime=${ts}`
      )
        .then((r) => {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then((data: { directImageUrl?: string }) => ({
          index: i,
          url: data.directImageUrl ?? null,
        }))
        .catch((e: Error) => ({
          index: i,
          url: null,
          error: `Slide ${i + 1}: ${e.message}`,
        }))
    );
  }
  const results = await Promise.all(promises);
  const urls: { index: number; url: string | null }[] = [];
  const errors: string[] = [];
  for (const r of results) {
    urls.push({ index: r.index, url: r.url });
    if (r.error) errors.push(r.error);
  }
  return { urls, errors };
}

export function parseDocSendUrl(url: string): string | null {
  const match = url.match(DOCSEND_URL_PATTERN);
  if (!match) {
    throw new InvalidURLError(
      `Invalid DocSend URL: ${url}\n` +
        "Expected format: https://docsend.com/view/XXXXXX, " +
        "https://custom.docsend.com/view/XXXXXX or /view/s/XXXXXX, or https://docsend.com/v/SPACE/NAME"
    );
  }
  return match[1] ?? null;
}

/** Profile key for per-deck login storage: slug for /view/SLUG, or "v-SPACE-NAME" for /v/SPACE/NAME */
export function getProfileKeyFromUrl(url: string): string {
  const match = url.match(DOCSEND_URL_PATTERN);
  if (!match) {
    throw new InvalidURLError(
      `Invalid DocSend URL: ${url}\n` +
        "Expected format: https://docsend.com/view/XXXXXX, " +
        "https://custom.docsend.com/view/XXXXXX or /view/s/XXXXXX, or https://docsend.com/v/SPACE/NAME"
    );
  }
  const viewSlug = match[1];
  if (viewSlug) return viewSlug;
  const space = match[2];
  const name = match[3];
  if (space && name) return `v-${space}-${name}`;
  throw new InvalidURLError(`Invalid DocSend URL: ${url}`);
}

function extractViewSlugFromUrl(url: string): string | null {
  const m = url.match(VIEW_SLUG_PATTERN);
  return m ? m[1] : null;
}

export interface ExtractOptions {
  headless: boolean;
  /** If set, use this profile key's saved login (per-deck). Ignored if that profile does not exist. */
  profileKey: string | null;
  /** When true, log debug info to stderr (page URL, evaluate result, etc.). */
  debug?: boolean;
  onStatus?: (message: string) => void;
}

function debugLog(enable: boolean, ...args: unknown[]): void {
  if (enable) {
    console.error("[deckli debug]", ...args);
  }
}

export async function extractSlideUrls(
  url: string,
  options: ExtractOptions
): Promise<DeckInfo> {
  const { headless, profileKey, debug = false, onStatus } = options;

  const report = (msg: string) => onStatus?.(msg);

  let slug: string | null = null;
  try {
    slug = parseDocSendUrl(url);
  } catch (e) {
    throw e;
  }

  const usePersistent = profileKey !== null && hasBrowserProfile(profileKey);
  const profileDir = usePersistent ? getBrowserProfileDir(profileKey) : "";

  debugLog(debug, "profileKey:", profileKey, "usePersistent:", usePersistent, "profileDir:", profileDir || "(none)");
  report("Launching browser...");

  const launchOptions = {
    headless,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  };

  const context = usePersistent
    ? await chromium.launchPersistentContext(profileDir, {
        ...launchOptions,
        userAgent: USER_AGENT,
        viewport: { width: 1920, height: 1080 },
      })
    : await (async () => {
        const browser = await chromium.launch(launchOptions);
        return browser.newContext({
          userAgent: USER_AGENT,
          viewport: { width: 1920, height: 1080 },
        });
      })();

  const page = await context.newPage();
  await page.addInitScript(
    'Object.defineProperty(navigator, "webdriver", { get: () => undefined });'
  );

  report("Loading page (this may take a while)...");

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  } catch {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  }

  const urlAfterGoto = page.url();
  debugLog(debug, "page URL after goto:", urlAfterGoto);

  report("Waiting for slides...");

  try {
    await page.waitForSelector(".carousel-inner .item", { timeout: 15_000 });
  } catch {
    const emailForm = await page.locator(
      'input[type="email"], form[action*="email"], .visitor-email'
    ).first();
    const hasEmailForm = (await emailForm.count()) > 0;
    await context.close();
    if (hasEmailForm) {
      throw new EmailGateError(
        "This deck requires email verification to view. Only public (no-email) decks are supported. Try 'deckli login <url>' for this deck or use --no-headless to log in manually."
      );
    }
    throw new ExtractionError(
      "Could not find slide content on the page. The page may have changed structure or failed to load."
    );
  }

  if (slug === null) {
    slug = extractViewSlugFromUrl(page.url());
  }
  if (slug === null) {
    await context.close();
    throw new ExtractionError(
      `Could not determine the document slug. After navigation the browser URL was: ${page.url()}`
    );
  }

  debugLog(debug, "resolved slug:", slug);

  if (debug) {
    const diag = await page.evaluate(() => {
      const items = document.querySelectorAll(".carousel-inner .item");
      const hasCarousel = document.querySelector(".carousel-inner") !== null;
      return {
        carouselInnerPresent: hasCarousel,
        itemCount: items.length,
        bodyClass: document.body?.className?.slice(0, 100) ?? "",
        title: document.title?.slice(0, 80) ?? "",
      };
    });
    debugLog(debug, "DOM diagnostic:", JSON.stringify(diag, null, 2));
  }

  let rawInfo: unknown;
  try {
    rawInfo = await page.evaluate(EXTRACT_INFO_JS);
  } catch (e) {
    debugLog(debug, "page.evaluate(EXTRACT_INFO_JS) threw:", e);
    await context.close();
    throw new ExtractionError(
      `Failed to run slide info script in the page: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  debugLog(debug, "raw EXTRACT_INFO_JS result:", JSON.stringify(rawInfo, null, 2));

  const info = rawInfo as
    | { slideCount: number; title: string }
    | undefined
    | null;

  if (info == null || typeof info.slideCount !== "number") {
    const debugHint = debug
      ? " (see --debug output above for raw script result)"
      : " Run with --debug for more details.";
    await context.close();
    throw new ExtractionError(
      "Could not read slide info from the page. The page structure may have changed or the deck may be empty." +
        debugHint
    );
  }

  const slideCount = info.slideCount;
  const deckTitle = info.title || "DocSend Deck";

  if (slideCount === 0) {
    await context.close();
    throw new ExtractionError("No slides found in this deck.");
  }

  const allUrls: (string | null)[] = new Array(slideCount).fill(null);
  const allWarnings: string[] = [];
  const totalBatches = Math.ceil(slideCount / PAGE_DATA_BATCH_SIZE);

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const batchStart = batchIdx * PAGE_DATA_BATCH_SIZE;
    const batchEnd = Math.min(
      batchStart + PAGE_DATA_BATCH_SIZE,
      slideCount
    );
    report(`Extracting URLs (${batchEnd}/${slideCount})...`);

    let rawBatchResult: unknown;
    try {
      rawBatchResult = await page.evaluate(extractBatchInPage, {
        slug,
        batchStart,
        batchEnd,
      });
    } catch (e) {
      debugLog(debug, "page.evaluate(extractBatchInPage) threw:", e);
      throw e;
    }

    debugLog(
      debug,
      `batch ${batchIdx + 1}/${totalBatches} (${batchStart}-${batchEnd}) raw:`,
      JSON.stringify(
        rawBatchResult,
        (_, v) => (typeof v === "undefined" ? "<undefined>" : v),
        2
      )
    );

    const batchResult = rawBatchResult as
      | { urls: { index: number; url: string | null }[]; errors: string[] }
      | undefined
      | null;

    if (batchResult?.urls == null || !Array.isArray(batchResult.urls)) {
      await context.close();
      throw new ExtractionError(
        `Batch script returned invalid result (no urls array).${debug ? " See --debug output above." : " Run with --debug for details."}`
      );
    }

    for (const entry of batchResult.urls) {
      allUrls[entry.index] = entry.url;
    }
    allWarnings.push(...(batchResult.errors ?? []));
  }

  await context.close();

  const validCount = allUrls.filter(Boolean).length;
  if (validCount === 0) {
    throw new ExtractionError(
      "Could not retrieve any image URLs from page_data endpoints."
    );
  }

  return {
    title: deckTitle,
    slideCount,
    imageUrls: allUrls,
    warnings: allWarnings,
    slug,
  };
}
