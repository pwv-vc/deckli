import { createInterface } from "readline";
import { mkdirSync } from "fs";
import ora from "ora";
import pc from "picocolors";
import type { Command } from "commander";
import { getBrowserProfileDir } from "../lib/storage.js";
import { detectSource } from "../lib/sources/index.js";
import { loginWithBrowser } from "../lib/sources/base.js";
import { formatError } from "../lib/output.js";

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
      "Open browser to log in to a deck source for a specific deck; session is saved per deck (use different URLs to use different logins)"
    )
    .option("--json", "Output result as JSON")
    .action(async (url: string | undefined, options: { json?: boolean }) => {
      const json = options.json ?? false;
      if (!url?.trim()) {
        const msg = "URL is required. Example: deckrd login https://docsend.com/view/XXXXXX";
        console.error(json ? formatError(msg, "json") : formatError(msg, "plain"));
        process.exit(1);
      }
      try {
        const source = detectSource(url.trim());
        const profileKey = source.getProfileKey(url.trim());
        const profileDir = getBrowserProfileDir(profileKey);
        mkdirSync(profileDir, { recursive: true });

        const spinner = ora("Opening browser...").start();

        if (source.login) {
          spinner.succeed("Browser opened");
          console.log(
            pc.gray("\nLog in with the account that can access this deck. When done, press Enter here.\n")
          );
          await waitForEnter();
          await source.login(url.trim(), profileDir, { headless: false });
        } else {
          await loginWithBrowser(url.trim(), profileDir, { headless: false });
          spinner.succeed("Browser opened");
          console.log(
            pc.gray("\nLog in with the account that can access this deck. When done, press Enter here.\n")
          );
          await waitForEnter();
        }

        console.log(
          pc.green(
            `Login saved for this deck (${profileKey}). Use deckrd "${url.trim()}" to download.`
          )
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(json ? formatError(message, "json") : formatError(message, "plain"));
        process.exit(1);
      }
    });
}
