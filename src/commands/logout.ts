import pc from "picocolors";
import type { Command } from "commander";
import { clearBrowserProfile, hasBrowserProfile, listProfileKeys } from "../lib/storage.js";
import { getProfileKeyFromUrl } from "../lib/extractor.js";
import { formatError } from "../lib/output.js";

export function registerLogoutCommand(program: Command): void {
  program
    .command("logout [url]")
    .description(
      "Clear saved login for a deck (give URL) or all decks (no URL). Sessions are stored per deck."
    )
    .action(async (url: string | undefined) => {
      const json = program.opts().json ?? false;
      if (url?.trim()) {
        try {
          const profileKey = getProfileKeyFromUrl(url.trim());
          if (!hasBrowserProfile(profileKey)) {
            const msg = `No saved login for this deck (${profileKey}).`;
            console.log(json ? JSON.stringify({ success: true, message: msg }, null, 2) : pc.gray(msg));
            return;
          }
          clearBrowserProfile(profileKey);
          console.log(
            json
              ? JSON.stringify({ success: true, message: `Login cleared for ${profileKey}.` }, null, 2)
              : pc.green(`Login cleared for this deck (${profileKey}).`)
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(json ? JSON.stringify({ success: false, error: message }, null, 2) : formatError(message, "plain"));
          process.exit(1);
        }
        return;
      }
      const keys = listProfileKeys();
      if (keys.length === 0) {
        console.log(
          json ? JSON.stringify({ success: true, message: "No saved logins." }, null, 2) : pc.gray("No saved login sessions found.")
        );
        return;
      }
      clearBrowserProfile();
      console.log(
        json
          ? JSON.stringify({ success: true, message: `Cleared ${keys.length} login session(s).` }, null, 2)
          : pc.green(`Cleared ${keys.length} login session(s).`)
      );
    });
}
