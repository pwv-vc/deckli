import { createInterface } from "readline";
import { chromium } from "playwright";
import ora from "ora";
import pc from "picocolors";
import type { Command } from "commander";
import { getBrowserProfileDir } from "../lib/storage.js";
import { getProfileKeyFromUrl } from "../lib/extractor.js";
import { formatError } from "../lib/output.js";
import { mkdirSync } from "fs";

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(pc.gray("Press Enter when you have finished logging in..."), () => {
      rl.close();
      resolve();
    });
  });
}

export function registerLoginCommand(program: Command): void {
  program
    .command("login <url>")
    .description(
      "Open browser to log in to DocSend for a specific deck; session is saved per deck (use different URLs to use different logins)"
    )
    .action(async (url: string | undefined) => {
      const json = program.opts().json ?? false;
      if (!url?.trim()) {
        const msg = "URL is required. Example: deckli login https://docsend.com/view/XXXXXX";
        console.error(json ? JSON.stringify({ success: false, error: msg }, null, 2) : formatError(msg, "plain"));
        process.exit(1);
      }
      try {
        const profileKey = getProfileKeyFromUrl(url.trim());
        const profileDir = getBrowserProfileDir(profileKey);
        mkdirSync(profileDir, { recursive: true });

        const spinner = ora("Opening browser...").start();
        const context = await chromium.launchPersistentContext(profileDir, {
          headless: false,
        });

        const page = await context.newPage();
        await page.goto(url.trim());
        spinner.succeed("Browser opened");

        console.log(
          pc.gray("\nLog in with the account that can access this deck. When done, press Enter here.\n")
        );

        await waitForEnter();
        await context.close();
        console.log(
          pc.green(
            `Login saved for this deck (${profileKey}). Use deckli "${url.trim()}" to download.`
          )
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(json ? JSON.stringify({ success: false, error: message }, null, 2) : formatError(message, "plain"));
        process.exit(1);
      }
    });
}
