export interface DeckInfo {
  /** Source that produced this deck info, e.g. "docsend", "google", "pitchdeck" */
  sourceId: string;
  title: string;
  slideCount: number;
  imageUrls: (string | null)[];
  warnings: string[];
  /** URL-derived slug (e.g. from /view/SLUG) when available; used for cache key. */
  slug?: string | null;
}

export interface DownloadResult {
  successes: number;
  failures: number;
  totalBytes: number;
  failedSlides: string[];
}

export interface DeckDownloadResult {
  deckTitle: string;
  slideCount: number;
  successes: number;
  failures: number;
  totalBytes: number;
  failedSlides: string[];
  outputPath: string;
  markdownPath?: string | null;
  zipPath?: string | null;
  imagePaths?: string[];
}

/** Local ONNX models (`350m`, `1.2b`) or any OpenAI chat model id (e.g. `gpt-4o-mini`). */
export type MarkdownCleanupModelKey = "350m" | "1.2b" | (string & {});

/** A single post-processing plugin: receives cleaned markdown, calls OpenAI, writes one output file. */
export interface PostProcessPlugin {
  /** Unique key used as the registry ID and CLI flag name, e.g. `"summary"`. */
  id: string;
  /** Display label shown in the spinner, e.g. `"Summarizing deck"`. */
  label: string;
  /** Appended to the deck title to form the output filename, e.g. `"summary"` → `{name}.summary.md`. */
  outputSuffix: string;
  /** Output file extension. */
  outputFormat: "md" | "json" | "csv";
  /** Full system prompt sent to the OpenAI model. */
  systemPrompt: string;
  /** Maximum completion tokens for this step. */
  maxTokens: number;
  /** Override the model used for this plugin. Defaults to the workflow's configured model (e.g. `"gpt-4o-mini"`). */
  model?: string;
}

export interface PostProcessResult {
  pluginId: string;
  outputPath: string;
  success: boolean;
  estimatedCostUsd: number | null;
}

export interface PostProcessWorkflowOptions {
  debug?: boolean;
  onPluginStart?: (id: string, label: string) => void;
  onPluginDone?: (result: PostProcessResult) => void;
}

/** Options passed to ActionPlugin.run(). */
export interface ActionPluginRunOptions {
  debug?: boolean;
  /** OpenAI model ID used for URL extraction and other small structured calls. */
  modelId?: string;
}

/**
 * An action-based post-processing plugin: receives cleaned markdown, performs arbitrary
 * async work (HTTP fetches, browser automation, etc.), and writes one output file.
 * Unlike PostProcessPlugin, it is not LLM-driven — it implements its own run() method.
 */
export interface ActionPlugin {
  /** Unique key used as the registry ID and CLI flag name, e.g. `"favicon"`. */
  id: string;
  /** Display label shown in the spinner, e.g. `"Fetching favicon"`. */
  label: string;
  /** Appended to the deck title to form the output filename, e.g. `"favicon"` → `{name}.favicon.ico`. */
  outputSuffix: string;
  run(
    markdown: string,
    outputDir: string,
    title: string,
    options: ActionPluginRunOptions
  ): Promise<PostProcessResult>;
}

export interface Config {
  headless: boolean;
  concurrency: number;
  maxRetries: number;
  useStoredLogin: boolean;
  markdownCleanupModel?: MarkdownCleanupModelKey;
  markdownContextLimitTokens?: number;
  /** When true, allow full-doc cleanup when within context limit; when false (default), always use slide-by-slide. */
  markdownCleanupFullDoc?: boolean;
  /** Plugin IDs to run in the post-processing workflow. Defaults to all built-in plugins. */
  postProcessSteps?: string[];
}

export interface DownloadOptions {
  output?: string;
  /** Output format: `pdf` (default) or `png` (slides only, no assembled PDF). */
  format?: "pdf" | "png";
  /** @deprecated Use `format: "png"` instead. */
  images?: boolean;
  /**
   * When true (default), PDF mode copies slides into `deckDir/images/` and includes them in the zip.
   * PNG mode: when false, slide PNGs stay on disk but are omitted from the zip.
   */
  bundleImages?: boolean;
  headless?: boolean;
  json?: boolean;
  debug?: boolean;
  /** For email-gated decks: `?email=` on the URL and automated Continue on the modal when possible. */
  email?: string;
  /** OCR markdown output. Omitted or `undefined` defaults to `true` (CLI: `--no-markdown` to disable). */
  markdown?: boolean;
  /** Model cleanup of OCR markdown. Omitted or `undefined` defaults to `true` (CLI: `--no-cleanup` to disable). */
  cleanup?: boolean;
  /** Run deck summary post-processing step. Defaults to `true` (CLI: `--no-summary` to disable). */
  summary?: boolean;
  /** Run team extraction post-processing step. Defaults to `true` (CLI: `--no-team` to disable). */
  team?: boolean;
  /** Run links extraction post-processing step. Defaults to `true` (CLI: `--no-links` to disable). */
  links?: boolean;
  /** Run What If statement post-processing step. Defaults to `true` (CLI: `--no-whatif` to disable). */
  whatif?: boolean;
  /** Run favicon fetch post-processing step. Defaults to `true` (CLI: `--no-favicon` to disable). */
  favicon?: boolean;
  /** Run website screenshot post-processing step. Defaults to `true` (CLI: `--no-screenshot` to disable). */
  screenshot?: boolean;
  force?: boolean;
  /** Explicit source id override (e.g. "docsend"). Auto-detected from URL when omitted. */
  source?: string;
}

export const DEFAULT_CONFIG: Config = {
  headless: true,
  concurrency: 10,
  maxRetries: 3,
  useStoredLogin: true,
  markdownCleanupModel: "gpt-4o-mini",
  markdownContextLimitTokens: 32_000,
  markdownCleanupFullDoc: false,
};

/** Options passed to DeckSource.extractSlideUrls */
export interface ExtractOptions {
  headless: boolean;
  /** If set, use this profile key's saved login (per-deck). Ignored if that profile does not exist. */
  profileKey: string | null;
  /**
   * For "require email" decks: added to the URL as `?email=` and used to fill/submit the Continue modal if slides do not load immediately.
   */
  gateEmail?: string;
  /** When true, log debug info to stderr (page URL, evaluate result, etc.). */
  debug?: boolean;
  onStatus?: (message: string) => void;
}

/**
 * Plugin interface for a deck source (e.g. DocSend, Google Slides, PitchDeck, Brieflink).
 * Each source implements URL detection, identifier parsing, and slide extraction.
 * The shared output pipeline (PDF, OCR, AI cleanup, ZIP) is source-agnostic.
 */
export interface DeckSource {
  /** Unique identifier, e.g. "docsend", "google", "pitchdeck", "brieflink" */
  readonly id: string;
  /** Human-readable name, e.g. "DocSend", "Google Slides" */
  readonly name: string;
  /** Example URL shown in help text */
  readonly exampleUrl: string;

  /** Returns true if this source can handle the given URL */
  canHandle(url: string): boolean;

  /**
   * Parses a URL-derived identifier used for cache keys.
   * Returns null if no identifier can be extracted (e.g. space/name URLs).
   * Throws InvalidURLError if URL is invalid for this source.
   */
  parseIdentifier(url: string): string | null;

  /**
   * Returns a profile key for per-deck login storage.
   * Throws InvalidURLError if URL is invalid.
   */
  getProfileKey(url: string): string;

  /**
   * Core extraction: launches browser, navigates to URL, returns DeckInfo with slide image URLs.
   * The returned DeckInfo must have sourceId set to this source's id.
   */
  extractSlideUrls(url: string, options: ExtractOptions): Promise<DeckInfo>;

  /**
   * Optional: source-specific login flow.
   * If absent, the generic Playwright persistent-context login in sources/base.ts is used.
   */
  login?(url: string, profileDir: string, options: { headless?: boolean; debug?: boolean }): Promise<void>;
}

/** Generic base error for all deck source errors. */
export class DeckSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeckSourceError";
    Object.setPrototypeOf(this, DeckSourceError.prototype);
  }
}

/** @deprecated Use DeckSourceError. Kept for backward compatibility. */
export class DocSendError extends DeckSourceError {
  constructor(message: string) {
    super(message);
    this.name = "DocSendError";
    Object.setPrototypeOf(this, DocSendError.prototype);
  }
}

export class InvalidURLError extends DeckSourceError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidURLError";
    Object.setPrototypeOf(this, InvalidURLError.prototype);
  }
}

export class EmailGateError extends DeckSourceError {
  constructor(message: string) {
    super(message);
    this.name = "EmailGateError";
    Object.setPrototypeOf(this, EmailGateError.prototype);
  }
}

export class ExtractionError extends DeckSourceError {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
    Object.setPrototypeOf(this, ExtractionError.prototype);
  }
}
