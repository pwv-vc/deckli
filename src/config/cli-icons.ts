import figures from "figures";

/**
 * CLI status symbols (summary footer + ora spinners). Edit values here to change icons app-wide.
 * Defaults use the `figures` package (Unicode with ASCII fallbacks on limited terminals).
 */
export const CLI_ICONS = {
  /** Browser launch / page load / extraction status (extractor `onStatus` lines). */
  browser: figures.triangleRightSmall,
  slides: figures.pointer,
  failed: figures.cross,
  failedItem: figures.pointerSmall,
  pdf: figures.squareSmallFilled,
  totalSize: figures.squareSmall,
  output: figures.arrowRight,
  markdown: figures.info,
  archive: figures.lozenge,
  images: figures.star,
  rawMarkdown: figures.circle,
  cleanedMarkdown: figures.tick,
  done: figures.tick,
  warning: figures.warning,
  ocr: figures.circle,
  /** Download slide images to disk */
  download: figures.arrowRight,
  deck: figures.pointer,
  cleanup: figures.tick,
  success: figures.tick,
  info: figures.info,
  /** Horizontal rule character (summary separators). */
  line: figures.line,
} as const;
