/**
 * Backward-compatibility shim.
 * All DocSend extraction logic now lives in src/lib/sources/docsend.ts.
 * This file re-exports the public API so existing imports and tests continue to work.
 */
export { EXTRACT_INFO_JS, appendEmailQueryParam, docsendSource } from "./sources/docsend.js";
export type { ExtractOptions } from "./types.js";

import { docsendSource } from "./sources/docsend.js";

export function parseDocSendUrl(url: string): string | null {
  return docsendSource.parseIdentifier(url);
}

export function getProfileKeyFromUrl(url: string): string {
  return docsendSource.getProfileKey(url);
}

export async function extractSlideUrls(
  url: string,
  options: import("./types.js").ExtractOptions
): Promise<import("./types.js").DeckInfo> {
  return docsendSource.extractSlideUrls(url, options);
}
