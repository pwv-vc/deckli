export interface DeckInfo {
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

export interface Config {
  headless: boolean;
  concurrency: number;
  maxRetries: number;
  useStoredLogin: boolean;
  markdownCleanupModel?: MarkdownCleanupModelKey;
  markdownContextLimitTokens?: number;
  /** When true, allow full-doc cleanup when within context limit; when false (default), always use slide-by-slide. */
  markdownCleanupFullDoc?: boolean;
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
  force?: boolean;
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

export class DocSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocSendError";
    Object.setPrototypeOf(this, DocSendError.prototype);
  }
}

export class InvalidURLError extends DocSendError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidURLError";
  }
}

export class EmailGateError extends DocSendError {
  constructor(message: string) {
    super(message);
    this.name = "EmailGateError";
  }
}

export class ExtractionError extends DocSendError {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}
