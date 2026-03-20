/** Unified debug logger. Accepts a boolean flag or an options object with a `debug` property. */
export function debugLog(
  enabled: boolean | { debug?: boolean },
  ...args: unknown[]
): void {
  const on = typeof enabled === "boolean" ? enabled : (enabled.debug ?? false);
  if (on) {
    console.error("[deckrd debug]", ...args);
  }
}
