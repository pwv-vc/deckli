import type { MarkdownCleanupModelKey } from "./types.js";
import { debugLog } from "./logger.js";
import { DEFAULT_CONTEXT_LIMIT_TOKENS } from "./constants.js";

export { DEFAULT_CONTEXT_LIMIT_TOKENS };

const MODEL_IDS: Record<"350m" | "1.2b", string> = {
  "350m": "onnx-community/LFM2-350M-Extract-ONNX",
  "1.2b": "onnx-community/LFM2-1.2B-Extract-ONNX",
};

export const SYSTEM_PROMPT = `Rewrite the following OCR text from a single slide into clean, readable markdown. Fix obvious OCR errors, merge broken lines into paragraphs, and remove repeated headers/footers (e.g. "Strictly Confidential", company name on every slide). If the slide has a clear main title or heading, output it as the very first line formatted as \`# Title\`. Then continue with the rest of the cleaned content. Preserve lists. Output only the cleaned markdown—no labels like system/user/assistant, no JSON, no XML, and no angle-bracket tags (e.g. no <tag>). Start with \`# Title\` or plain text, not structured markup. If you must use JSON, use only: {"markdown": "your cleaned text here"}.`;

export const FULL_DOC_SYSTEM_PROMPT = `Rewrite the following OCR markdown from a full deck into clean, readable markdown. Fix obvious OCR errors, merge broken lines into paragraphs, and remove repeated headers/footers (e.g. "Strictly Confidential"). Keep the document structure: the main # title and ## Slide N headings. For each slide, if there is a clear main title or heading visible in the slide content, update the heading to \`## Slide N: Title\`. Output only the cleaned markdown—no labels like system/user/assistant, no XML, and no angle-bracket tags (e.g. no <tag>). Start with # title or plain text, not structured markup. If you must use JSON, use only: {"markdown": "your cleaned text here"}.`;

export const NAME_DECK_SYSTEM_PROMPT = `From the following slide text, extract the company name and/or product name for a filename. You must respond with valid JSON only, no other text. Use this exact schema: {"title": "NameHere-deck"}. The title must be a short filename: only letters, numbers, and hyphens, ending with -deck. Example: {"title": "AcmeCorp-ProductName-deck"}.`;

/**
 * Normalize blank lines around markdown headings and collapse excessive whitespace.
 * Ensures a blank line before and after every heading, and collapses 3+ blank lines to 2.
 * Applied to full-doc cleanup output (which bypasses reassembleMarkdown).
 * Exported for tests.
 */
export function normalizeMarkdownSpacing(markdown: string): string {
  const text = markdown.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  return text
    .replace(/([^\n])\n(#{1,6} )/g, "$1\n\n$2")
    .replace(/(#{1,6} [^\n]+)\n([^\n])/g, "$1\n\n$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Rough token count (chars / 4). Exported for callers to decide full-doc vs slide-by-slide. */
export function estimateTokens(str: string): number {
  return Math.ceil(str.length / 4);
}

/** ChatML-style prompt for LFM2 Extract models. */
function buildChatPrompt(system: string, user: string): string {
  return `<|startoftext|><|im_start|>system
${system}<|im_end|>
<|im_start|>user
${user}<|im_end|>
<|im_start|>assistant
`;
}

/** Extract assistant reply from model output (strip the prompt and stop at end tokens). */
function extractAssistantReply(fullOutput: string, prompt: string): string {
  let text = fullOutput.startsWith(prompt) ? fullOutput.slice(prompt.length) : fullOutput;
  const endMarkers = ["<|im_end|>", "<|endoftext|>"];
  for (const marker of endMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) text = text.slice(0, idx);
  }
  text = text.trim();
  return stripEchoedChatMl(text);
}

/**
 * Remove echoed "system", "user", "assistant" lines and prompt text from model output.
 * Some models repeat the ChatML structure in plain text; keep only the actual reply.
 */
function stripEchoedChatMl(reply: string): string {
  const lines = reply.split("\n");
  let lastAssistantIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim().toLowerCase();
    if (t === "assistant") lastAssistantIdx = i;
  }
  if (lastAssistantIdx >= 0) {
    const after = lines.slice(lastAssistantIdx + 1).join("\n").trim();
    if (after) return after;
  }
  return reply;
}

/** True if the string looks like JSON or XML (model returned structured data instead of markdown). Exported for tests. */
export function looksLikeStructuredOutput(s: string): boolean {
  const t = s.trim();
  return t.startsWith("{") || t.startsWith("<?xml") || t.startsWith("<data") || (t.startsWith("<") && t.includes(">"));
}

/** If the reply is JSON with a markdown-like key, return that value; otherwise null. */
export function extractMarkdownFromStructured(reply: string): string | null {
  const t = reply.trim();
  if (!t.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;
      for (const key of ["markdown", "cleaned_markdown", "text", "content", "cleaned_text"]) {
        if (typeof o[key] === "string") {
          const v = (o[key] as string).trim();
          if (v && !looksLikeStructuredOutput(v)) return v;
        }
      }
    }
  } catch {
    const m = t.match(/"markdown"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) return m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\t/g, "\t").trim() || null;
  }
  return null;
}

/** Try to parse a "title" from model output that should be JSON like {"title": "Name-deck"}. */
export function parseTitleFromJson(reply: string): string | null {
  let trimmed = reply.trim();
  const codeFence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```/);
  if (codeFence) trimmed = codeFence[1].trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && "title" in parsed && typeof (parsed as { title: unknown }).title === "string") {
      const t = (parsed as { title: string }).title.trim();
      return t || null;
    }
  } catch {
    const doubleQuoted = trimmed.match(/"title"\s*:\s*"([^"]*)"/);
    if (doubleQuoted) return doubleQuoted[1].trim() || null;
    const singleQuoted = trimmed.match(/'title'\s*:\s*'([^']*)'/);
    if (singleQuoted) return singleQuoted[1].trim() || null;
  }
  return null;
}

export interface ParsedSlide {
  index: number;
  body: string;
}

export interface ParsedMarkdown {
  title: string;
  slides: ParsedSlide[];
}

/**
 * Split raw markdown (from ocrImagesToMarkdown) into title and per-slide bodies.
 * Exported for unit tests.
 */
export function splitMarkdownIntoSlides(rawMarkdown: string): ParsedMarkdown {
  let title = "Deck";
  const titleMatch = rawMarkdown.match(/^#\s+(.+)$/m);
  if (titleMatch) title = titleMatch[1].trim();

  const slides: ParsedSlide[] = [];
  const slideRegex = /\n##\s+Slide\s+(\d+)[^\n]*\n/g;
  let match: RegExpExecArray | null;
  let lastEnd = 0;
  let lastIndex = 0;
  while ((match = slideRegex.exec(rawMarkdown)) !== null) {
    if (lastEnd > 0) {
      let body = rawMarkdown.slice(lastEnd, match.index);
      body = body.replace(/\n---\s*$/m, "").trim();
      slides.push({ index: lastIndex, body });
    }
    lastIndex = parseInt(match[1], 10);
    lastEnd = match.index + match[0].length;
  }
  if (lastEnd > 0) {
    let body = rawMarkdown.slice(lastEnd);
    body = body.replace(/\n---\s*$/m, "").trim();
    slides.push({ index: lastIndex, body });
  }

  return { title, slides };
}

/**
 * Reassemble title and cleaned slide bodies into a single markdown string.
 */
export function reassembleMarkdown(parsed: ParsedMarkdown, cleanedBodies: string[]): string {
  const parts: string[] = [`# ${parsed.title}`, ""];
  const sortedSlides = [...parsed.slides].sort((a, b) => a.index - b.index);
  sortedSlides.forEach((slide, i) => {
    let body = cleanedBodies[i] ?? slide.body;
    const titleMatch = body.match(/^#\s+(.+?)(?:\n|$)/);
    let slideHeading = `## Slide ${slide.index}`;
    if (titleMatch) {
      const extractedTitle = titleMatch[1].trim();
      slideHeading = `## Slide ${slide.index}: ${extractedTitle}`;
      body = body.slice(titleMatch[0].length).trimStart();
      // Remove echoed title if the model repeated it as the first line of the body
      const firstLine = body.split("\n")[0].trim();
      if (firstLine.toLowerCase() === extractedTitle.toLowerCase()) {
        body = body.slice(firstLine.length).trimStart();
      }
    }
    // Collapse excessive blank lines in the cleaned body
    body = body.replace(/\n{3,}/g, "\n\n").trim();
    parts.push(slideHeading, "");
    parts.push(body);
    parts.push("", "---", "");
  });
  if (parts[parts.length - 1] === "" && parts[parts.length - 2] === "") {
    parts.pop();
    parts.pop();
  }
  return parts.join("\n").trimEnd();
}

function getModelId(key: "350m" | "1.2b"): string {
  const id = MODEL_IDS[key];
  if (id) return id;
  return MODEL_IDS["350m"];
}

function normalizeLocalModelKey(key: unknown): "350m" | "1.2b" {
  if (key === "1.2b" || key === "350m") return key;
  return "350m";
}

/** Human-readable cleanup model label for CLI (e.g. "350m (onnx-community/…)" or "gpt-4o-mini (OpenAI)"). */
export function getCleanupModelLabel(key: MarkdownCleanupModelKey): string {
  const k = typeof key === "string" ? key : "350m";
  if (isOpenAiModelKey(k)) return `${k} (OpenAI)`;
  const local = normalizeLocalModelKey(k);
  return `${local} (${getModelId(local)})`;
}

const MAX_FRIENDLY_NAME_LENGTH = 80;

/** Phrases that indicate the model returned the system prompt or instructions instead of a name. */
const PROMPT_LEAK_PHRASES = [
  "from the following",
  "extract the company",
  "slide text",
  "andor",
  "system-",
  "nothing else",
];

const MAX_REASONABLE_NAME_LENGTH = 50;

/**
 * Returns true if the string looks like leaked prompt/instructions rather than a deck name.
 * Exported for unit tests.
 */
export function isPromptLeak(name: string): boolean {
  if (!name || name.length > MAX_REASONABLE_NAME_LENGTH) return true;
  const lower = name.toLowerCase();
  for (const phrase of PROMPT_LEAK_PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  return false;
}

/** Make a string safe for use as a filename: letters, numbers, hyphens only; ensure -deck suffix. */
export function sanitizeFriendlyDeckName(s: string): string {
  let t = s
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!t) return "";
  if (!t.toLowerCase().endsWith("-deck")) t = t + "-deck";
  return t.slice(0, MAX_FRIENDLY_NAME_LENGTH);
}

export interface DeriveFriendlyDeckNameResult {
  name: string;
  /** Estimated USD for OpenAI title call; null for local model or no API usage. */
  estimatedCostUsd: number | null;
}

export interface DeriveFriendlyDeckNameOptions {
  maxInputTokens?: number;
  /** When true, log title-detection progress to stderr. */
  debug?: boolean;
}

const DEFAULT_MAX_INPUT_TOKENS_TITLE = 500;

type TextGenPipeline = (
  input: string,
  opts?: {
    max_new_tokens?: number;
    temperature?: number;
    do_sample?: boolean;
    return_full_text?: boolean;
  }
) => Promise<Array<{ generated_text: string }>>;

type TextGenPipeInstance = (
  input: string,
  opts?: {
    max_new_tokens?: number;
    temperature?: number;
    do_sample?: boolean;
    return_full_text?: boolean;
    streamer?: import("@huggingface/transformers").TextStreamer;
  }
) => Promise<Array<{ generated_text: string }>>;

type PipeWithTokenizer = TextGenPipeInstance & {
  tokenizer: { decode: (ids: unknown, opts?: unknown) => string };
};

/**
 * Use the Extract model to derive a friendly deck name (company/product + -deck) from first-slide or full-doc text.
 * Returns sanitized name or fallback if the model fails or returns empty/invalid.
 */
export async function deriveFriendlyDeckName(
  firstSlideOcrText: string,
  fallback: string,
  modelKey: MarkdownCleanupModelKey = "gpt-4o-mini",
  options: DeriveFriendlyDeckNameOptions = {}
): Promise<DeriveFriendlyDeckNameResult> {
  const { maxInputTokens = DEFAULT_MAX_INPUT_TOKENS_TITLE } = options;
  const keyStr = typeof modelKey === "string" ? modelKey : "gpt-4o-mini";
  if (isOpenAiModelKey(keyStr)) {
    const { deriveFriendlyDeckNameWithOpenAi } = await import("./openai-cleanup.js");
    return deriveFriendlyDeckNameWithOpenAi(firstSlideOcrText, fallback, keyStr, options);
  }

  const key = normalizeLocalModelKey(modelKey);
  const maxChars = maxInputTokens * 4;
  const text = firstSlideOcrText.trim().slice(0, maxChars);
  if (!text) {
    debugLog(options, "Title detection: no input text, using fallback.");
    return { name: fallback, estimatedCostUsd: null };
  }

  const modelId = getModelId(key);
  let pipe: TextGenPipeline;

  debugLog(options, "Loading model for title detection...");
  try {
    const { pipeline } = await import("@huggingface/transformers");
    pipe = (await pipeline("text-generation", modelId, {
      device: "cpu",
      dtype: "q4",
    })) as TextGenPipeline;
    debugLog(options, "Title model loaded.");
  } catch (err) {
    debugLog(options, `Title model load failed: ${err instanceof Error ? err.message : String(err)}, using fallback.`);
    return { name: fallback, estimatedCostUsd: null };
  }

  const prompt = buildChatPrompt(NAME_DECK_SYSTEM_PROMPT, text);
  try {
    debugLog(options, "Calling title model...");
    const out = await pipe(prompt, {
      max_new_tokens: 64,
      temperature: 0,
      do_sample: false,
      return_full_text: true,
    });
    debugLog(options, "Title model returned.");
    const generated = Array.isArray(out) && out[0] && typeof out[0].generated_text === "string"
      ? out[0].generated_text
      : "";
    const raw = extractAssistantReply(generated, prompt).trim();
    const fromJson = parseTitleFromJson(raw);
    const rawTitle = fromJson ?? raw;
    if (isPromptLeak(rawTitle)) {
      debugLog(options, "Title detection: model output looked like prompt leak, using fallback.");
      return { name: fallback, estimatedCostUsd: null };
    }
    const friendly = sanitizeFriendlyDeckName(rawTitle);
    if (isPromptLeak(friendly)) {
      debugLog(options, "Title detection: sanitized name looked like prompt leak, using fallback.");
      return { name: fallback, estimatedCostUsd: null };
    }
    return { name: friendly || fallback, estimatedCostUsd: null };
  } catch (err) {
    debugLog(options, `Title model call failed: ${err instanceof Error ? err.message : String(err)}, using fallback.`);
    return { name: fallback, estimatedCostUsd: null };
  }
}

export interface CleanupMarkdownResult {
  markdown: string;
  /** Estimated USD for OpenAI cleanup; null for local model or no billable API usage. */
  estimatedCostUsd: number | null;
}

export interface CleanupMarkdownOptions {
  onProgress?: (current: number, total: number) => void;
  /** When set, streaming is used and this is called with the current generated character count and (when available) the text so far for progress preview. */
  onStreamProgress?: (chars: number, textSoFar?: string) => void;
  /** When set, each new decoded chunk is passed here (e.g. to stream to a file for progress). */
  onStreamChunk?: (chunk: string) => void;
  contextLimitTokens?: number;
  /** When true, allow full-doc cleanup when within context limit; when false (default), always use slide-by-slide. */
  fullDoc?: boolean;
  /** When true, log progress to stderr (e.g. full-doc vs slide-by-slide, model call start/end). */
  debug?: boolean;
}

/**
 * Clean raw OCR markdown using a Liquid Nano Extract model (ONNX via Transformers.js).
 * On load or inference failure, returns the original rawMarkdown and logs a warning.
 */
async function cleanupMarkdownWithLocalExtract(
  rawMarkdown: string,
  modelKey: "350m" | "1.2b",
  options: CleanupMarkdownOptions = {}
): Promise<CleanupMarkdownResult> {
  const { onProgress, onStreamProgress, onStreamChunk, contextLimitTokens = DEFAULT_CONTEXT_LIMIT_TOKENS, fullDoc: allowFullDoc = false } = options;
  const key = normalizeLocalModelKey(modelKey);
  const parsed = splitMarkdownIntoSlides(rawMarkdown);
  if (parsed.slides.length === 0) return { markdown: rawMarkdown, estimatedCostUsd: null };

  const modelLabel = getCleanupModelLabel(key);
  debugLog(options, `Loading cleanup model: ${modelLabel}...`);
  const modelId = getModelId(key);
  let pipe: PipeWithTokenizer;

  let TextStreamerClass: typeof import("@huggingface/transformers").TextStreamer | undefined;
  try {
    const hf = await import("@huggingface/transformers");
    TextStreamerClass = hf.TextStreamer;
    pipe = (await hf.pipeline("text-generation", modelId, {
      device: "cpu",
      dtype: "q4",
    })) as PipeWithTokenizer;
    debugLog(options, `Model loaded: ${modelLabel}.`);
  } catch (err) {
    console.warn(
      "[deckli] Markdown cleanup failed to load model:",
      err instanceof Error ? err.message : String(err)
    );
    return { markdown: rawMarkdown, estimatedCostUsd: null };
  }

  const fullPrompt = buildChatPrompt(FULL_DOC_SYSTEM_PROMPT, rawMarkdown);
  const inputTokens = estimateTokens(fullPrompt);
  const outputReserve = Math.ceil(estimateTokens(rawMarkdown) * 1.2);
  const useFullDoc = allowFullDoc && inputTokens + outputReserve <= contextLimitTokens;

  const makeStreamer = (): import("@huggingface/transformers").TextStreamer | undefined => {
    if ((!onStreamProgress && !onStreamChunk) || !TextStreamerClass) return undefined;
    let streamChars = 0;
    let textSoFar = "";
    return new TextStreamerClass(pipe.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string) => {
        streamChars += text.length;
        textSoFar += text;
        onStreamProgress?.(streamChars, textSoFar);
        onStreamChunk?.(text);
      },
    });
  };

  if (useFullDoc) {
    const maxNewTokens = Math.min(8192, contextLimitTokens - inputTokens);
    debugLog(
      options,
      `Full-doc cleanup: input ~${inputTokens} tokens, max_new_tokens=${maxNewTokens} (this may take several minutes)...`
    );
    onProgress?.(1, 1);
    try {
      const streamer = makeStreamer();
      const out = await pipe(fullPrompt, {
        max_new_tokens: maxNewTokens,
        temperature: 0,
        do_sample: false,
        return_full_text: true,
        ...(streamer && { streamer }),
      });
      debugLog(options, "Full-doc cleanup: model returned.");
      const generated = Array.isArray(out) && out[0] && typeof out[0].generated_text === "string"
        ? out[0].generated_text
        : "";
      const cleaned = extractAssistantReply(generated, fullPrompt);
      if (cleaned && !looksLikeStructuredOutput(cleaned)) return { markdown: normalizeMarkdownSpacing(cleaned), estimatedCostUsd: null };
      const fromStruct = extractMarkdownFromStructured(cleaned);
      if (fromStruct) return { markdown: normalizeMarkdownSpacing(fromStruct), estimatedCostUsd: null };
      return { markdown: rawMarkdown, estimatedCostUsd: null };
    } catch (err) {
      debugLog(options, `Full-doc cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
      return { markdown: rawMarkdown, estimatedCostUsd: null };
    }
  }

  debugLog(options, `Slide-by-slide cleanup: ${parsed.slides.length} slides.`);

  const cleanedBodies: string[] = [];
  const total = parsed.slides.length;
  const sortedSlides = [...parsed.slides].sort((a, b) => a.index - b.index);

  for (let i = 0; i < sortedSlides.length; i++) {
    onProgress?.(i + 1, total);
    const slide = sortedSlides[i];
    debugLog(options, `Cleaning slide ${i + 1}/${total}...`);
    const prompt = buildChatPrompt(SYSTEM_PROMPT, slide.body);
    try {
      const streamer = makeStreamer();
      const out = await pipe(prompt, {
        max_new_tokens: 1024,
        temperature: 0,
        do_sample: false,
        return_full_text: true,
        ...(streamer && { streamer }),
      });
      const generated = Array.isArray(out) && out[0] && typeof out[0].generated_text === "string"
        ? out[0].generated_text
        : "";
      const cleaned = extractAssistantReply(generated, prompt);
      if (cleaned && !looksLikeStructuredOutput(cleaned)) {
        cleanedBodies.push(cleaned);
      } else {
        const fromStruct = cleaned ? extractMarkdownFromStructured(cleaned) : null;
        cleanedBodies.push(fromStruct || slide.body);
      }
    } catch {
      cleanedBodies.push(slide.body);
    }
  }

  return { markdown: reassembleMarkdown(parsed, cleanedBodies), estimatedCostUsd: null };
}

/**
 * Clean OCR markdown: OpenAI chat models when `markdownCleanupModel` starts with `gpt-`, else local LFM2 Extract ONNX.
 */
export async function cleanupMarkdownWithExtract(
  rawMarkdown: string,
  modelKey: MarkdownCleanupModelKey,
  options: CleanupMarkdownOptions = {}
): Promise<CleanupMarkdownResult> {
  const keyStr = typeof modelKey === "string" ? modelKey : "gpt-4o-mini";
  if (isOpenAiModelKey(keyStr)) {
    const { cleanupMarkdownWithOpenAi } = await import("./openai-cleanup.js");
    return cleanupMarkdownWithOpenAi(rawMarkdown, keyStr, options);
  }
  return cleanupMarkdownWithLocalExtract(rawMarkdown, normalizeLocalModelKey(modelKey), options);
}

/** True when the configured model id should use the OpenAI API (e.g. gpt-4o-mini). Re-exported from openai-cleanup for convenience. */
export function isOpenAiModelKey(key: string): boolean {
  return key.startsWith("gpt-");
}
