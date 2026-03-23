import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Page } from "playwright";
import type { DeckSource, DeckInfo, ExtractOptions } from "../types.js";
import { InvalidURLError, ExtractionError } from "../types.js";
import { launchBrowserContext } from "./base.js";
import { getBrowserProfileDir, hasBrowserProfile } from "../storage.js";
import { debugLog } from "../logger.js";

const CANVA_URL_PATTERN =
  /^https?:\/\/(?:www\.)?canva\.com\/design\/([A-Za-z0-9]+)\/([A-Za-z0-9_-]+)/;

const CANVA_THUMBNAIL_PATTERN =
  /https:\/\/document-export\.canva\.com\/[^/]+\/[^/]+\/\d+\/thumbnail\/(\d+)\.png/;

/**
 * Parse Canva URL and extract design ID and workspace ID.
 * Strips utm_* query parameters.
 */
function parseCanvaUrl(url: string): { designId: string; workspaceId: string } {
  const u = new URL(url);
  for (const key of Array.from(u.searchParams.keys())) {
    if (key.startsWith("utm_")) {
      u.searchParams.delete(key);
    }
  }

  const match = u.href.match(CANVA_URL_PATTERN);
  if (!match) {
    throw new InvalidURLError(`Invalid Canva URL: ${url}`);
  }

  return {
    designId: match[1],
    workspaceId: match[2],
  };
}

/**
 * Try to log in to Canva using an email address.
 * Looks for Canva's "Continue with email" flow and submits the address.
 * Returns true if the login form was found and submitted (inbox verification may still be needed).
 */
async function tryCanvaEmailLogin(
  page: Page,
  email: string,
  debug: boolean
): Promise<boolean> {
  const addr = email.trim();
  if (!addr) return false;

  // Check if we're on a login/signup page
  const isLoginPage =
    page.url().includes("/login") ||
    page.url().includes("/signup") ||
    (await page.locator('input[type="email"], input[name="email"]').count()) > 0;

  if (!isLoginPage) {
    debugLog(debug, "tryCanvaEmailLogin: not on a login page, skipping");
    return false;
  }

  debugLog(debug, "tryCanvaEmailLogin: found login page, attempting email login");

  try {
    const emailInput = page
      .locator('input[type="email"], input[name="email"]')
      .first();
    if ((await emailInput.count()) === 0) {
      debugLog(debug, "tryCanvaEmailLogin: no email input found");
      return false;
    }

    await emailInput.fill(addr);

    // Click "Continue with email" or similar button
    const continueBtn = page
      .getByRole("button", { name: /continue/i })
      .first();
    if ((await continueBtn.count()) > 0) {
      await continueBtn.click();
      await page.waitForTimeout(2000);
      debugLog(debug, "tryCanvaEmailLogin: submitted email, awaiting verification");
      return true;
    }
  } catch (err) {
    debugLog(debug, "tryCanvaEmailLogin error:", err);
  }

  return false;
}

/**
 * Automate Canva's Share → Download → PDF flow to get a full-quality PDF.
 * Requires a logged-in browser session.
 * Returns the local path to the downloaded PDF, or throws on failure.
 */
async function downloadCanvaPdf(
  page: Page,
  designId: string,
  debug: boolean,
  onStatus?: (msg: string) => void
): Promise<string> {
  onStatus?.("Triggering Canva PDF export...");

  // Wait for the Share button to be visible BEFORE creating the download promise.
  // This ensures we throw early (no pending promise) if the editor hasn't loaded.
  // Note: Canva sets role="menuitem" on toolbar buttons, so getByRole('button') won't
  // match them. Use locator('button').filter({ hasText }) instead.
  debugLog(debug, "Canva PDF: waiting for Share button");
  const shareBtn = page.locator("button").filter({ hasText: /^share$/i }).first();
  await shareBtn.waitFor({ state: "visible", timeout: 15_000 });

  // Register download listener only after we know the UI is ready.
  // Attach .catch() immediately to suppress unhandled rejection if we throw
  // before reaching `await downloadPromise` (e.g. context closes in finally).
  const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
  downloadPromise.catch(() => {});

  // Click Share — opens the Share panel
  debugLog(debug, "Canva PDF: clicking Share button");
  await shareBtn.click();
  await page.waitForTimeout(800);

  // If a login modal appeared (session expired / not logged in), bail out
  const loginModal = page.locator("button").filter({ hasText: /continue with/i }).first();
  if ((await loginModal.count()) > 0) {
    throw new Error(
      "Canva showed a login prompt after clicking Share. " +
        "Your session may have expired — run `deckrd login <url>` to refresh it."
    );
  }

  // Click "Download" in the Share panel
  debugLog(debug, "Canva PDF: clicking Download option");
  const downloadOption = page
    .locator("button, [role='menuitem'], [role='option']")
    .filter({ hasText: /^download$/i })
    .first();
  await downloadOption.waitFor({ state: "visible", timeout: 8_000 });
  await downloadOption.click();
  await page.waitForTimeout(800);

  // Select PDF format.
  // Canva renders format options as radio buttons or a listbox depending on the UI version.
  debugLog(debug, "Canva PDF: selecting PDF format");
  const pdfRadio = page.locator("input[type='radio']").filter({ hasText: /pdf/i }).first();
  const pdfOption = page
    .locator("[role='radio'], [role='option'], button, label")
    .filter({ hasText: /^pdf$/i })
    .first();

  if ((await pdfRadio.count()) > 0) {
    await pdfRadio.click();
  } else if ((await pdfOption.count()) > 0) {
    await pdfOption.click();
  }
  await page.waitForTimeout(400);

  // Click the final "Download" button inside the dialog.
  // Use last() — the Share panel header also contains "Download" text.
  debugLog(debug, "Canva PDF: clicking final Download button");
  const finalDownloadBtn = page
    .locator("button")
    .filter({ hasText: /^download$/i })
    .last();
  await finalDownloadBtn.waitFor({ state: "visible", timeout: 8_000 });
  await finalDownloadBtn.click();

  // Wait for the browser download to start
  debugLog(debug, "Canva PDF: waiting for download...");
  const download = await downloadPromise;
  debugLog(debug, `Canva PDF download URL: ${download.url()}`);

  // Save to a temp path
  const tempDir = join(tmpdir(), `deckrd-canva-${designId}`);
  mkdirSync(tempDir, { recursive: true });
  const tempPdfPath = join(tempDir, `${designId}.pdf`);
  await download.saveAs(tempPdfPath);

  onStatus?.("PDF downloaded from Canva");
  debugLog(debug, `Canva PDF saved to: ${tempPdfPath}`);
  return tempPdfPath;
}

export const canvaSource: DeckSource = {
  id: "canva",
  name: "Canva",
  exampleUrl:
    "https://www.canva.com/design/DAHEThNWfBc/4LBwmcVLZhL1Sr-QiBhXkQ/edit",

  canHandle(url: string): boolean {
    return CANVA_URL_PATTERN.test(url);
  },

  parseIdentifier(url: string): string | null {
    try {
      const { designId } = parseCanvaUrl(url);
      return designId;
    } catch {
      return null;
    }
  },

  getProfileKey(url: string): string {
    const { designId } = parseCanvaUrl(url);
    return `canva-${designId}`;
  },

  async extractSlideUrls(
    url: string,
    options: ExtractOptions
  ): Promise<DeckInfo> {
    const { headless, profileKey, gateEmail, debug = false, onStatus } = options;
    const report = (msg: string) => onStatus?.(msg);

    const { designId } = parseCanvaUrl(url);
    debugLog(debug, "Canva design:", designId);

    // Fix session reuse: mirror DocSend's pattern
    const usePersistent = profileKey !== null && hasBrowserProfile(profileKey);
    const profileDir = usePersistent
      ? getBrowserProfileDir(profileKey)
      : undefined;

    debugLog(
      debug,
      "profileKey:", profileKey,
      "usePersistent:", usePersistent,
      "profileDir:", profileDir ?? "(none)"
    );

    report("Launching browser...");
    const context = await launchBrowserContext({
      headless,
      profileDir,
      acceptDownloads: true,
    });
    const page = await context.newPage();

    // Intercept thumbnail requests before navigation (for OCR images)
    const capturedUrls = new Map<number, string>(); // pageNum -> full signed URL

    page.on("response", (response) => {
      const reqUrl = response.url();
      if (reqUrl.includes("document-export.canva.com") && response.ok()) {
        debugLog(debug, `[canva network] ${reqUrl.split("?")[0]}`);
      }
      const match = reqUrl.match(CANVA_THUMBNAIL_PATTERN);
      if (match && response.ok()) {
        const pageNum = parseInt(match[1], 10);
        capturedUrls.set(pageNum, reqUrl);
        debugLog(debug, `Captured slide ${pageNum}: ${reqUrl.split("?")[0]}`);
      }
    });

    try {
      report("Loading Canva design...");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

      // Handle email login if not logged in and --email was provided
      if (!usePersistent && gateEmail) {
        report("Attempting email login...");
        const submitted = await tryCanvaEmailLogin(page, gateEmail, debug);
        if (submitted) {
          report("Email submitted — inbox verification may be required. Use `deckrd login <url>` for a saved session.");
        }
      }

      // Extract title from page metadata
      const title = await page.evaluate(() => {
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) {
          const content = ogTitle.getAttribute("content");
          if (content) return content;
        }
        return document.title || "";
      });

      report("Discovering slides...");

      // Wait for thumbnails to load
      await page.waitForTimeout(2000);

      // Scroll the page panel to trigger loading of all slide thumbnails
      await page.evaluate(() => {
        const panels = document.querySelectorAll(
          '[class*="panel"], [class*="sidebar"], [class*="pages"], [data-testid*="page"]'
        );
        for (const panel of panels) {
          if (panel.scrollHeight > panel.clientHeight) {
            panel.scrollTo(0, panel.scrollHeight);
          }
        }
        window.scrollTo(0, document.body.scrollHeight);
      });

      // Wait for more thumbnails to load after scrolling
      await page.waitForTimeout(3000);

      debugLog(debug, `Captured ${capturedUrls.size} thumbnail URLs`);

      if (capturedUrls.size === 0) {
        throw new ExtractionError(
          "No slides found in this Canva design. It may be private or inaccessible. " +
            (usePersistent
              ? "Check that your saved login is still valid."
              : "Run `deckrd login <url>` to save a session, or pass --email <address> to attempt login.")
        );
      }

      // Sort by page number and build ordered array
      const sortedPages = Array.from(capturedUrls.keys()).sort(
        (a, b) => a - b
      );
      const imageUrls = sortedPages.map((n) => capturedUrls.get(n)!);

      debugLog(debug, `Found ${imageUrls.length} slides`);

      const warnings: string[] = [];

      return {
        sourceId: "canva",
        title: title || `Canva Design ${designId}`,
        slideCount: imageUrls.length,
        imageUrls,
        warnings,
        slug: designId,
      };
    } finally {
      await context.close();
    }
  },
};
