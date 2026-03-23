import { existsSync, rmSync } from "fs";
import pc from "picocolors";
import type { Command } from "commander";
import { detectSource } from "../lib/sources/index.js";
import { getSlideCacheDir } from "../lib/storage.js";
import { formatError } from "../lib/output.js";

export function registerCacheCommand(program: Command): void {
  const cache = program
    .command("cache")
    .description("Manage the local slide image cache")
    .enablePositionalOptions();

  cache
    .command("clear <url>")
    .description("Delete cached slide images for a deck URL")
    .option("--json", "Output result as JSON")
    .action(async (url: string, options: { json?: boolean }, cmd) => {
      const json = options.json ?? cmd.parent?.parent?.opts().json ?? false;
      try {
        const source = detectSource(url.trim());
        const identifier = source.parseIdentifier(url.trim());
        if (!identifier) {
          const msg = "Could not parse a cache key from that URL.";
          console.error(json ? formatError(msg, "json") : formatError(msg, "plain"));
          process.exit(1);
        }
        const cacheKey = `${source.id}-${identifier}`;
        const dir = getSlideCacheDir(cacheKey);

        if (!existsSync(dir)) {
          if (json) {
            console.log(JSON.stringify({ cleared: false, cacheKey, dir, message: `No cache found for ${cacheKey}` }));
          } else {
            console.log(pc.yellow(`ℹ No cache found for ${cacheKey}`));
          }
          return;
        }

        rmSync(dir, { recursive: true, force: true });

        if (json) {
          console.log(JSON.stringify({ cleared: true, cacheKey, dir }));
        } else {
          console.log(pc.green(`✔ Cache cleared: ${dir}`));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(json ? formatError(message, "json") : formatError(message, "plain"));
        process.exit(1);
      }
    });
}
