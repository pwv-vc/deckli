import { chromium } from "playwright";
import type { Page, BrowserContext } from "playwright";
import { USER_AGENT } from "../constants.js";
import { debugLog } from "../logger.js";

export interface LaunchOptions {
  headless: boolean;
  /** If set, uses launchPersistentContext with this directory. */
  profileDir?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
}

/** Launch a Playwright browser context, optionally with a persistent profile. */
export async function launchBrowserContext(options: LaunchOptions): Promise<BrowserContext> {
  const {
    headless,
    profileDir,
    userAgent = USER_AGENT,
    viewport = { width: 1920, height: 1080 },
  } = options;

  const launchArgs = {
    headless,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  };

  if (profileDir) {
    return chromium.launchPersistentContext(profileDir, {
      ...launchArgs,
      userAgent,
      viewport,
    });
  }

  const browser = await chromium.launch(launchArgs);
  return browser.newContext({ userAgent, viewport });
}

/** Fill email field (if present) and click Continue; return true once slide carousel is visible. */
export async function tryPassEmailGate(
  page: Page,
  email: string,
  debug: boolean
): Promise<boolean> {
  const addr = email.trim();
  if (!addr) return false;

  const emailInput = page.locator('input[type="email"]').first();
  if ((await emailInput.count()) === 0) {
    debugLog(debug, "tryPassEmailGate: no email input");
    return false;
  }

  const current = await emailInput.inputValue().catch(() => "");
  if (!current.trim()) {
    await emailInput.fill(addr);
  }

  const continueBtn = page.getByRole("button", { name: /^Continue$/i }).first();
  if ((await continueBtn.count()) === 0) {
    debugLog(debug, "tryPassEmailGate: no Continue button");
    return false;
  }

  await continueBtn.click();

  try {
    await page.waitForSelector(".carousel-inner .item", { timeout: 25_000 });
    return true;
  } catch {
    debugLog(debug, "tryPassEmailGate: carousel did not appear after Continue");
    return false;
  }
}

/**
 * Generic login flow: opens a persistent browser profile, navigates to the URL,
 * waits for the user to log in manually, then closes the context.
 * Sources can use this directly or override DeckSource.login() for custom flows.
 */
export async function loginWithBrowser(
  url: string,
  profileDir: string,
  options: { headless?: boolean; debug?: boolean } = {}
): Promise<void> {
  const { headless = false } = options;
  const context = await launchBrowserContext({ headless, profileDir });
  const page = await context.newPage();
  await page.goto(url);
  await context.close();
}
