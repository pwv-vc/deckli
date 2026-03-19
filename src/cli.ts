#!/usr/bin/env node

import { config as loadDotenv } from "dotenv";
loadDotenv();

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Command } from "commander";
import { registerDownloadCommand } from "./commands/download.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerLogoutCommand } from "./commands/logout.js";
import { runDownload } from "./commands/download.js";
import { showBanner } from "./banner.js";
import { formatError } from "./lib/output.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };
const version = pkg.version;

const program = new Command();

program
  .name("deckli")
  .description("Download DocSend decks as PDF — one command, full quality")
  .version(version, "-v, --version", "Output only the version number")
  .helpOption("-h, --help", "Show help")
  .exitOverride()
  .option("-o, --output <path>", "Output path: .pdf file, or directory")
  .option("--images", "Save individual PNG images instead of a single PDF")
  .option("-m, --markdown", "Also create .md with OCR from each slide; use with --cleanup for cleaned text")
  .option("--cleanup", "Clean markdown with OpenAI or local model (requires -m); also used for title detection")
  .option("--force", "Re-download slide images even if already present")
  .option("--no-headless", "Show the browser window during extraction")
  .option("--json", "Output result as JSON")
  .option("--debug", "Log debug info to stderr (page URL, slide info, etc.)")
  .argument("[url]", "DocSend deck URL (e.g. https://docsend.com/view/XXXXXX)")
  .action(async (url: string | undefined, opts: { output?: string; images?: boolean; headless?: boolean; json?: boolean; debug?: boolean; markdown?: boolean; cleanup?: boolean; force?: boolean }) => {
    if (url?.trim()) {
      const json = opts.json ?? false;
      if (!json) showBanner();
      try {
        await runDownload(url, {
          output: opts.output,
          images: opts.images,
          headless: opts.headless,
          json,
          debug: opts.debug,
          markdown: opts.markdown,
          cleanup: opts.cleanup,
          force: opts.force,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (json) {
          console.error(JSON.stringify({ success: false, error: message }, null, 2));
        } else {
          console.error(formatError(message, "plain"));
        }
        process.exit(1);
      }
    }
  });

registerDownloadCommand(program);
registerLoginCommand(program);
registerLogoutCommand(program);

(async () => {
  const args = process.argv.slice(2);
  if (args.includes("-v") || args.includes("--version")) {
    console.log(version);
    process.exit(0);
  }

  await program.parseAsync(process.argv);

  const url = program.processedArgs[0];
  const hasSubcommand = ["download", "login", "logout"].includes(args[0] ?? "");
  if (!hasSubcommand && !url) {
    program.outputHelp();
  }
})().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
