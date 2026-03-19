#!/usr/bin/env node

import { config as loadDotenv } from "dotenv";
loadDotenv();

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Command, Option } from "commander";
import { registerDownloadCommand, runDownload } from "./commands/download.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerLogoutCommand } from "./commands/logout.js";
import { showBanner } from "./banner.js";
import { formatError } from "./lib/output.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };
const version = pkg.version;

const program = new Command();

program
  .name("deckli")
  .description(
    "Download DocSend decks into <parent>/<slug>/: PDF or PNG slides, OCR markdown, summary.json, and a zip (see README)"
  )
  .version(version, "-v, --version", "Output only the version number")
  .helpOption("-h, --help", "Show help")
  .exitOverride()
  .option(
    "-o, --output <path>",
    "Parent directory for deck output (each deck goes to <parent>/<slug>/). A path ending in .pdf sets the parent directory only; the filename is ignored"
  )
  .addOption(
    new Option("--format <type>", "pdf (default): cache slides, assemble one PDF; png: slide PNGs only, no PDF")
      .choices(["pdf", "png"])
      .default("pdf")
  )
  .option(
    "--no-bundle-images",
    "Do not copy slides into <slug>/images/ (pdf mode) or omit slides from the zip (png mode)"
  )
  .option("--images", "Deprecated: same as --format png (prints a warning)")
  .option("-m, --markdown", "Write OCR markdown (default: on)")
  .option("--no-markdown", "Skip OCR markdown (PDF or PNG files only)")
  .option("--cleanup", "Run model cleanup on OCR text (default: on)")
  .option("--no-cleanup", "Skip cleanup; keep raw .ocr.md only")
  .option(
    "--force",
    "Re-download slides even if already present (~/.deckli/cache for pdf, or <slug>/images for png)"
  )
  .option("--no-headless", "Run the browser visibly (login, debugging)")
  .option("--json", "Print summary JSON to stdout; summary.json and zip are still written under <slug>/")
  .option("--debug", "Verbose stderr: URLs, extraction, model/title steps")
  .option(
    "--email <address>",
    "Email for require-email gates: add ?email= to the URL and auto-click Continue when the modal appears"
  )
  .argument("[url]", "DocSend deck URL (e.g. https://docsend.com/view/XXXXXX)")
  .action(async (url: string | undefined, opts: { output?: string; format?: string; images?: boolean; bundleImages?: boolean; headless?: boolean; json?: boolean; debug?: boolean; markdown?: boolean; cleanup?: boolean; force?: boolean; email?: string }) => {
    if (url?.trim()) {
      const json = opts.json ?? false;
      if (!json) showBanner();
      if (opts.images) {
        console.warn("[deckli] --images is deprecated; use --format png");
      }
      try {
        await runDownload(url, {
          output: opts.output,
          format: opts.images ? "png" : opts.format === "png" ? "png" : "pdf",
          bundleImages: opts.bundleImages !== false,
          images: opts.images,
          headless: opts.headless,
          json,
          debug: opts.debug,
          markdown: opts.markdown,
          cleanup: opts.cleanup,
          force: opts.force,
          email: opts.email,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(json ? formatError(message, "json") : formatError(message, "plain"));
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
