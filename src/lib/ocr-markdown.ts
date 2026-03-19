import { createWorker } from "tesseract.js";

/** Sanitize deck title for use in markdown (escape # and trim). */
function escapeMarkdownTitle(title: string): string {
  return title.replace(/#/g, "").trim() || "Deck";
}

/**
 * Human-readable H1 from a friendly filename base (e.g. `RenewablesBridge-deck` → `RenewablesBridge`).
 * Strips a trailing `-deck`, turns remaining hyphens into spaces.
 */
export function deckHeadingFromFriendlyFilename(friendlyBase: string): string {
  let t = friendlyBase.replace(/-deck$/i, "").trim();
  if (!t) t = friendlyBase;
  return escapeMarkdownTitle(t.replace(/-/g, " "));
}

/**
 * Replace the document’s first top-level `#` line (deck title from OCR / DocSend slug).
 */
export function replaceMarkdownDocumentH1(markdown: string, newTitle: string): string {
  const line = escapeMarkdownTitle(newTitle);
  if (!/^#\s+/m.test(markdown)) {
    return `# ${line}\n\n${markdown}`;
  }
  return markdown.replace(/^#\s+[^\n]*/m, `# ${line}`);
}

/**
 * After a friendly deck filename is chosen, replace the main `#` heading so it matches the deck name
 * instead of the DocSend slug. No-op when the friendly name equals the original deck title.
 */
export function applyFriendlyDeckHeading(rawMd: string, outputTitle: string, deckInfoTitle: string): string {
  if (outputTitle === deckInfoTitle) return rawMd;
  return replaceMarkdownDocumentH1(rawMd, deckHeadingFromFriendlyFilename(outputTitle));
}

/** Clean OCR text for markdown: trim, collapse multiple newlines. */
function cleanSlideText(text: string): string {
  return text
    .trim()
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Build markdown string from an array of slide texts (for testing and reuse).
 * Exported for unit tests.
 */
export function buildMarkdownFromTexts(
  slideTexts: string[],
  deckTitle: string
): string {
  const title = escapeMarkdownTitle(deckTitle);
  const parts: string[] = [`# ${title}`, ""];
  slideTexts.forEach((text, i) => {
    parts.push(`## Slide ${i + 1}`, "");
    parts.push(cleanSlideText(text || ""));
    parts.push("", "---", "");
  });
  if (parts[parts.length - 1] === "" && parts[parts.length - 2] === "") {
    parts.pop();
    parts.pop();
  }
  return parts.join("\n").trimEnd();
}

export interface OcrMarkdownOptions {
  lang?: string;
  onProgress?: (current: number, total: number) => void;
}

/**
 * Run OCR on a single image and return the raw text.
 * Used for deriving a friendly deck name from the first slide.
 */
export async function ocrSingleImage(
  imagePath: string,
  options: OcrMarkdownOptions = {}
): Promise<string> {
  const { lang = "eng" } = options;
  const worker = await createWorker(lang);
  try {
    const { data } = await worker.recognize(imagePath);
    return (data.text ?? "").trim();
  } finally {
    await worker.terminate();
  }
}

/**
 * Run OCR on each image path and return a single markdown string.
 * On per-slide failure, appends "[OCR failed for this slide]".
 */
export async function ocrImagesToMarkdown(
  imagePaths: string[],
  deckTitle: string,
  options: OcrMarkdownOptions = {}
): Promise<string> {
  const { lang = "eng", onProgress } = options;
  const worker = await createWorker(lang);
  const slideTexts: string[] = [];
  const total = imagePaths.length;

  try {
    for (let i = 0; i < imagePaths.length; i++) {
      onProgress?.(i + 1, total);
      try {
        const { data } = await worker.recognize(imagePaths[i]);
        slideTexts.push(data.text ?? "");
      } catch {
        slideTexts.push("[OCR failed for this slide]");
      }
    }
    return buildMarkdownFromTexts(slideTexts, deckTitle);
  } finally {
    await worker.terminate();
  }
}
