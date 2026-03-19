import figures from "figures";
import pc from "picocolors";

/**
 * CLI status symbols (summary footer + ora spinners). Edit values here to change icons app-wide.
 * Defaults use the `figures` package (Unicode with ASCII fallbacks on limited terminals).
 */
const raw = {
  /** Browser launch / page load / extraction status (extractor `onStatus` lines). */
  browser: figures.triangleRightSmall,
  /** Slides saved (summary) — slideshow / frames. */
  slides: figures.play,
  failed: figures.cross,
  failedItem: figures.pointerSmall,
  /** Assembled PDF — solid “page” tone. */
  pdf: figures.squareMediumShade,
  /** Total byte size — one blob of data. */
  totalSize: figures.bullet,
  /** Primary output path — destination / home for the deck. */
  output: figures.home,
  /** Markdown file — lines / structure (also “Markdown written” spinner). */
  markdown: figures.hamburger,
  /** Zip / archive — hollow container. */
  archive: figures.lozengeOutline,
  /** Slide images on disk — solid capture dot. */
  images: figures.radioOn,
  /** OCR’d / rough text — open / draft ring. */
  rawMarkdown: figures.circleDotted,
  cleanedMarkdown: figures.tick,
  done: figures.tick,
  warning: figures.warning,
  /** OCR — ◎ reads like an eye (“reading” the slide). */
  ocr: figures.circleDouble,
  /** Download slide images to disk */
  download: figures.arrowDown,
  deck: figures.pointer,
  cleanup: figures.tick,
  success: figures.tick,
  info: figures.info,
  /** Horizontal rule character (summary separators). */
  line: figures.line,
} as const;

export type CliIconKey = keyof typeof raw;

/** Raw figure glyphs (no ANSI). Use when a parent `pc.red()` / `pc.dim()` already sets color. */
export const CLI_ICONS: typeof raw = raw;

/**
 * Same keys as {@link CLI_ICONS}, with semantic ANSI colors for TTY output.
 * Respects `NO_COLOR` / non-TTY via picocolors.
 */
export const CLI_ICONS_COLOR: { [K in CliIconKey]: string } = {
  browser: pc.cyan(raw.browser),
  slides: pc.magenta(raw.slides),
  failed: pc.red(raw.failed),
  failedItem: pc.red(raw.failedItem),
  pdf: pc.yellow(raw.pdf),
  totalSize: pc.dim(raw.totalSize),
  output: pc.cyan(raw.output),
  markdown: pc.blue(raw.markdown),
  archive: pc.yellow(raw.archive),
  images: pc.magenta(raw.images),
  rawMarkdown: pc.dim(raw.rawMarkdown),
  cleanedMarkdown: pc.green(raw.cleanedMarkdown),
  done: pc.green(raw.done),
  warning: pc.yellow(raw.warning),
  ocr: pc.cyan(raw.ocr),
  download: pc.cyan(raw.download),
  deck: pc.blue(raw.deck),
  cleanup: pc.green(raw.cleanup),
  success: pc.green(raw.success),
  info: pc.blue(raw.info),
  line: pc.dim(raw.line),
};
