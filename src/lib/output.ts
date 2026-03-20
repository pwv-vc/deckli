import { homedir } from "os";
import { basename, dirname, relative, sep } from "path";
import { pathToFileURL } from "url";
import stringWidth from "string-width";
import pc from "picocolors";
import { CLI_ICONS, CLI_ICONS_COLOR } from "./cli-icons.js";
import type { DeckDownloadResult, DownloadResult } from "./types.js";

/** Strip ANSI colors and OSC 8 hyperlinks for measuring visible width. */
export function stripTerminalFormatting(s: string): string {
  return s
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\x1b]8;;[^\x1b]*\x1b\\/g, "");
}

/**
 * Terminal display width (columns) after stripping ANSI and OSC 8 hyperlinks.
 * Uses grapheme-aware width so borders align with bold, links, and wide symbols.
 */
export function terminalDisplayWidth(s: string): number {
  return stringWidth(stripTerminalFormatting(s));
}

/**
 * Terminal hyperlink (OSC 8). Supported in iTerm2, VS Code, Ghostty, many modern terminals.
 * Opens `url` when the user clicks `text`.
 */
export function terminalHyperlink(url: string, text: string): string {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

function fileUrl(absPath: string): string {
  return pathToFileURL(absPath).href;
}

function truncateVisual(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = Math.max(4, Math.floor((max - 1) / 2));
  const tail = Math.max(4, max - 1 - head);
  return s.slice(0, head) + "…" + s.slice(-tail);
}

/** Short label for display: relative to cwd, else `~/…`, else basename — capped for narrow terminals. */
export function shortPathLabel(absPath: string): string {
  const cwd = process.cwd();
  let label: string;
  try {
    const rel = relative(cwd, absPath);
    if (rel && rel !== ".." && !rel.startsWith(".." + sep) && !rel.startsWith(sep)) {
      label = rel;
    } else {
      const home = homedir();
      label = absPath.startsWith(home + sep) ? "~" + absPath.slice(home.length) : basename(absPath);
    }
  } catch {
    label = basename(absPath);
  }
  return truncateVisual(label, 52);
}

function linkedPath(absPath: string): string {
  return terminalHyperlink(fileUrl(absPath), shortPathLabel(absPath));
}


export function formatError(message: string, format: "plain" | "json"): string {
  if (format === "json") {
    return JSON.stringify({ success: false, error: message }, null, 2);
  }
  return pc.red(`Error: ${message}`);
}

/** Plain-text display for estimated OpenAI USD; em dash when local, skipped, or unknown pricing. */
export function formatEstimatedUsd(usd: number | null): string {
  if (usd == null) return "—";
  return `~$${usd.toFixed(6)}`;
}

export function formatSize(numBytes: number): string {
  let value = numBytes;
  const units = ["B", "KB", "MB", "GB"];
  let u = 0;
  while (Math.abs(value) >= 1024 && u < units.length - 1) {
    value /= 1024;
    u++;
  }
  return `${value.toFixed(1)} ${units[u]}`;
}

export interface DownloadSummaryResult extends DownloadResult {
  slideCount: number;
  outputPath?: string;
  markdownPath?: string | null;
  zipPath?: string | null;
  imagePaths?: string[];
  /** Raw markdown length (chars) when markdown was produced. */
  rawMarkdownChars?: number;
  /** Raw markdown file size (bytes, UTF-8) when markdown was produced. */
  rawMarkdownBytes?: number;
  /** Cleaned markdown length (chars) when cleanup was used. */
  cleanedMarkdownChars?: number;
  /** Cleaned markdown file size (bytes, UTF-8) when cleanup was used. */
  cleanedMarkdownBytes?: number;
  /** Estimated OpenAI cost for deck title detection; null = local / no billable call. Set when slides were processed. */
  titleAiCostUsd?: number | null;
  /** Estimated OpenAI cost for markdown cleanup; null = local / no billable call. Set when cleanup ran. */
  cleanupAiCostUsd?: number | null;
}

/** Optional fields written to `summary.json` alongside stdout `--json`. */
export interface DownloadSummaryPayloadExtras {
  slug?: string | null;
  deckDir?: string;
  parentOutput?: string;
  format?: "pdf" | "png";
  bundleImages?: boolean;
  summaryJsonPath?: string;
}

export function buildDownloadSummaryPayload(
  result: DownloadSummaryResult | DeckDownloadResult,
  deckTitle: string,
  outputPath: string,
  elapsedMs: number,
  extras?: DownloadSummaryPayloadExtras
): Record<string, unknown> {
  const summaryOutputPath = "outputPath" in result ? result.outputPath ?? outputPath : outputPath;
  const markdownPath = "markdownPath" in result ? result.markdownPath : undefined;
  const summaryResult = result as DownloadSummaryResult;

  const payload: Record<string, unknown> = {
    success: result.failures === 0,
    deckTitle,
    slideCount: result.slideCount,
    successes: result.successes,
    failures: result.failures,
    totalBytes: result.totalBytes,
    outputPath: summaryOutputPath,
    durationMs: Math.round(elapsedMs),
    downloadedAt: new Date().toISOString(),
  };
  if (markdownPath != null) payload.markdownPath = markdownPath;
  if (summaryResult.zipPath != null) payload.zipPath = summaryResult.zipPath;
  if (summaryResult.imagePaths && summaryResult.imagePaths.length > 0) payload.imagePaths = summaryResult.imagePaths;
  if (summaryResult.rawMarkdownChars != null) payload.rawMarkdownChars = summaryResult.rawMarkdownChars;
  if (summaryResult.rawMarkdownBytes != null) payload.rawMarkdownBytes = summaryResult.rawMarkdownBytes;
  if (summaryResult.cleanedMarkdownChars != null) payload.cleanedMarkdownChars = summaryResult.cleanedMarkdownChars;
  if (summaryResult.cleanedMarkdownBytes != null) payload.cleanedMarkdownBytes = summaryResult.cleanedMarkdownBytes;
  if (summaryResult.titleAiCostUsd !== undefined) payload.titleAiCostUsd = summaryResult.titleAiCostUsd;
  if (summaryResult.cleanupAiCostUsd !== undefined) payload.cleanupAiCostUsd = summaryResult.cleanupAiCostUsd;

  if (extras?.slug !== undefined) payload.slug = extras.slug;
  if (extras?.deckDir !== undefined) payload.deckDir = extras.deckDir;
  if (extras?.parentOutput !== undefined) payload.parentOutput = extras.parentOutput;
  if (extras?.format !== undefined) payload.format = extras.format;
  if (extras?.bundleImages !== undefined) payload.bundleImages = extras.bundleImages;
  if (extras?.summaryJsonPath !== undefined) payload.summaryJsonPath = extras.summaryJsonPath;

  return payload;
}

export function formatDownloadSummary(
  result: DownloadSummaryResult | DeckDownloadResult,
  deckTitle: string,
  outputPath: string,
  elapsedMs: number,
  format: "plain" | "json",
  extras?: DownloadSummaryPayloadExtras
): string {
  const summaryOutputPath = "outputPath" in result ? result.outputPath ?? outputPath : outputPath;
  const markdownPath = "markdownPath" in result ? result.markdownPath : undefined;

  const summaryResult = result as DownloadSummaryResult;
  if (format === "json") {
    return JSON.stringify(buildDownloadSummaryPayload(result, deckTitle, outputPath, elapsedMs, extras), null, 2);
  }

  const lines: string[] = [
    `${CLI_ICONS_COLOR.slides} ${pc.bold("Slides saved:")} ${result.successes}/${result.slideCount}`,
  ];
  if (result.failures > 0) {
    lines.push(pc.red(`${CLI_ICONS.failed} ${pc.bold("Failed:")} ${result.failures}`));
    for (const name of result.failedSlides) {
      lines.push(pc.red(`   ${CLI_ICONS.failedItem} ${name}`));
    }
  }
  const isPdf = summaryOutputPath.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    lines.push(`${CLI_ICONS_COLOR.pdf} ${pc.bold("PDF:")} ${formatSize(result.totalBytes)}`);
  } else {
    lines.push(`${CLI_ICONS_COLOR.totalSize} ${pc.bold("Total size:")} ${formatSize(result.totalBytes)}`);
  }
  lines.push(`${CLI_ICONS_COLOR.output} ${pc.bold("Output:")} ${linkedPath(summaryOutputPath)}`);
  if (markdownPath) {
    lines.push(`${CLI_ICONS_COLOR.markdown} ${pc.bold("Markdown:")} ${linkedPath(markdownPath)}`);
  }
  if (summaryResult.zipPath) {
    lines.push(`${CLI_ICONS_COLOR.archive} ${pc.bold("Archive:")} ${linkedPath(summaryResult.zipPath)}`);
  }
  if (summaryResult.imagePaths && summaryResult.imagePaths.length > 0) {
    const n = summaryResult.imagePaths.length;
    const imgDir = dirname(summaryResult.imagePaths[0]);
    const folderLink = terminalHyperlink(fileUrl(imgDir), shortPathLabel(imgDir));
    lines.push(`${CLI_ICONS_COLOR.images} ${pc.bold("Images:")} ${n} files · ${folderLink}`);
  }
  if (summaryResult.rawMarkdownChars != null) {
    const sizeStr = summaryResult.rawMarkdownBytes != null ? formatSize(summaryResult.rawMarkdownBytes) : "";
    lines.push(
      `${CLI_ICONS_COLOR.rawMarkdown} ${pc.bold("Raw markdown:")} ${summaryResult.rawMarkdownChars.toLocaleString()} chars${sizeStr ? ` (${sizeStr})` : ""}`
    );
  }
  if (summaryResult.cleanedMarkdownChars != null) {
    const sizeStr = summaryResult.cleanedMarkdownBytes != null ? formatSize(summaryResult.cleanedMarkdownBytes) : "";
    lines.push(
      `${CLI_ICONS_COLOR.cleanedMarkdown} ${pc.bold("Cleaned markdown:")} ${summaryResult.cleanedMarkdownChars.toLocaleString()} chars${sizeStr ? ` (${sizeStr})` : ""}`
    );
  }
  if (summaryResult.titleAiCostUsd !== undefined) {
    lines.push(
      `${CLI_ICONS_COLOR.aiTitleCost} ${pc.bold("AI title (est.):")} ${formatEstimatedUsd(summaryResult.titleAiCostUsd)}`
    );
  }
  if (summaryResult.cleanupAiCostUsd !== undefined) {
    lines.push(
      `${CLI_ICONS_COLOR.aiCleanupCost} ${pc.bold("AI cleanup (est.):")} ${formatEstimatedUsd(summaryResult.cleanupAiCostUsd)}`
    );
  }

  const doneLine =
    result.failures === 0
      ? `${CLI_ICONS_COLOR.done} ${pc.bold(pc.green(`Done in ${(elapsedMs / 1000).toFixed(1)}s`))}`
      : `${CLI_ICONS_COLOR.warning} ${pc.bold(pc.yellow(`Done in ${(elapsedMs / 1000).toFixed(1)}s`))}`;

  const indent = "  ";
  const cols = process.stdout.columns || 80;
  const innerMax = Math.max(
    terminalDisplayWidth(doneLine),
    ...lines.map((l) => terminalDisplayWidth(l)),
    32
  );
  /** Separator width: fits content (+ margin), never wider than the terminal. */
  const ruleLen = Math.min(cols, Math.max(36, innerMax + 6));
  const rule = pc.dim(CLI_ICONS.line.repeat(ruleLen));

  return ["", rule, `${indent}${doneLine}`, "", ...lines.map((line) => `${indent}${line}`), "", rule].join("\n");
}
