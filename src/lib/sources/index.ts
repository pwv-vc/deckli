import type { DeckSource } from "../types.js";
import { docsendSource } from "./docsend.js";

/** All registered sources, in priority order for URL detection. */
const SOURCES: DeckSource[] = [docsendSource];

/** Default source when no URL match is found. */
const DEFAULT_SOURCE: DeckSource = docsendSource;

/**
 * Auto-detects the source for a URL.
 * Falls back to DEFAULT_SOURCE (DocSend) if no source matches,
 * which will throw its own InvalidURLError on invalid input.
 */
export function detectSource(url: string): DeckSource {
  for (const source of SOURCES) {
    if (source.canHandle(url)) return source;
  }
  return DEFAULT_SOURCE;
}

/** Look up a source by its id (e.g. "docsend"). Returns undefined if not found. */
export function getSourceById(id: string): DeckSource | undefined {
  return SOURCES.find((s) => s.id === id);
}

/** All registered source ids, for --source flag validation. */
export function getSourceIds(): string[] {
  return SOURCES.map((s) => s.id);
}

export { SOURCES, DEFAULT_SOURCE };
