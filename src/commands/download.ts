import {
  createWriteStream,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  existsSync,
  statSync,
} from "fs";
import { join, dirname, basename } from "path";
import ora from "ora";
import { Command, Option } from "commander";
import { extractSlideUrls } from "../lib/extractor.js";
import { downloadSlides } from "../lib/downloader.js";
import { assemblePdf } from "../lib/assembler.js";
import { applyFriendlyDeckHeading, ocrImagesToMarkdown, ocrSingleImage } from "../lib/ocr-markdown.js";
import {
  cleanupMarkdownWithExtract,
  deriveFriendlyDeckName,
  estimateTokens,
  getCleanupModelLabel,
  splitMarkdownIntoSlides,
} from "../lib/markdown-cleanup.js";
import { CLI_ICONS_COLOR } from "../config/cli-icons.js";
import {
  buildDownloadSummaryPayload,
  formatDownloadSummary,
  formatError,
  type DownloadSummaryPayloadExtras,
  type DownloadSummaryResult,
} from "../lib/output.js";
import {
  loadConfig,
  getSlideCacheDir,
  resolveParentOutput,
  resolveDeckDir,
} from "../lib/storage.js";
import { getProfileKeyFromUrl, parseDocSendUrl } from "../lib/extractor.js";
import { copySlidesToBundleImages, createDeckArchive } from "../lib/deck-output.js";
import type { DeckInfo } from "../lib/types.js";

/** OCR output is `{base}.ocr.md`; cleaned deck markdown is `{base}.md` (same base as the PDF). */
function resolveMarkdownPathForPdf(pdfPath: string, kind: "ocr" | "main" = "ocr"): string {
  const base = basename(pdfPath, ".pdf");
  const dir = dirname(pdfPath);
  if (kind === "main") return join(dir, `${base}.md`);
  return join(dir, `${base}.ocr.md`);
}

function isOcrMarkdownFile(path: string): boolean {
  return path.endsWith(".ocr.md");
}

function isMainMarkdownFile(path: string): boolean {
  return path.endsWith(".md") && !path.endsWith(".ocr.md");
}

/** Last N chars of streamed text for CLI progress preview (single line, sanitized). */
function lastCharsPreview(text: string, maxLen: number = 40): string {
  if (!text) return "";
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return "…" + oneLine.slice(-maxLen);
}

const STREAM_WRITE_BATCH_BYTES = 1024;

/** Batched write of streamed chunks to a file; call flushStreamBuffer() after cleanup to write remainder and close. */
function createStreamWriteBuffer(
  cleanedPath: string,
  options: { json: boolean }
): { onChunk: (chunk: string) => void; flushAndClose: () => Promise<void> } {
  if (options.json) {
    return { onChunk: () => {}, flushAndClose: async () => {} };
  }
  let buffer = "";
  const stream = createWriteStream(cleanedPath, { flags: "w" });
  return {
    onChunk(chunk: string) {
      buffer += chunk;
      while (Buffer.byteLength(buffer, "utf-8") >= STREAM_WRITE_BATCH_BYTES) {
        let idx = 0;
        let bytes = 0;
        for (let i = 0; i < buffer.length; i++) {
          bytes += Buffer.byteLength(buffer[i], "utf-8");
          if (bytes >= STREAM_WRITE_BATCH_BYTES) {
            idx = i + 1;
            break;
          }
        }
        if (idx === 0) break;
        stream.write(buffer.slice(0, idx), "utf-8");
        buffer = buffer.slice(idx);
      }
    },
    flushAndClose: () =>
      new Promise<void>((resolve, reject) => {
        if (buffer.length > 0) stream.write(buffer, "utf-8");
        stream.end((err?: Error | null) => (err ? reject(err) : resolve()));
      }),
  };
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

const CACHE_METADATA_FILENAME = ".deckli-cache.json";

interface CacheMetadata {
  slideCount: number;
  title: string;
}

function readCacheMetadata(cacheDir: string): CacheMetadata | null {
  const path = join(cacheDir, CACHE_METADATA_FILENAME);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    if (data && typeof data === "object" && typeof (data as CacheMetadata).slideCount === "number" && typeof (data as CacheMetadata).title === "string") {
      return data as CacheMetadata;
    }
  } catch {
    // ignore
  }
  return null;
}

function writeCacheMetadata(cacheDir: string, meta: CacheMetadata): void {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, CACHE_METADATA_FILENAME), JSON.stringify(meta, null, 0), "utf-8");
}

/** True if dir contains slide_01.png through slide_{expectedCount}.png (same naming as downloader). */
function dirHasAllSlides(dir: string, expectedCount: number): boolean {
  if (!existsSync(dir) || expectedCount <= 0) return false;
  for (let i = 1; i <= expectedCount; i++) {
    const name = `slide_${String(i).padStart(2, "0")}.png`;
    if (!existsSync(join(dir, name))) return false;
  }
  return true;
}

/** Sum byte size of slide_*.png in dir; used for summary when reusing existing images. */
function totalSlideBytesInDir(dir: string): number {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("slide_") && f.endsWith(".png"))
    .slice(0, 200);
  let total = 0;
  for (const f of files) {
    try {
      total += statSync(join(dir, f)).size;
    } catch {
      // ignore
    }
  }
  return total;
}

export async function runDownload(url: string, options: DownloadOptions = {}): Promise<void> {
  const json = options.json ?? false;
  const isPngFormat = (options.format ?? "pdf") === "png" || options.images === true;
  const bundleImages = options.bundleImages !== false;
  const cwd = process.cwd();
  const config = loadConfig();
  const headless = options.headless ?? config.headless;
  let profileKey: string | null = null;
  if (config.useStoredLogin) {
    try {
      profileKey = getProfileKeyFromUrl(url.trim());
    } catch {
      profileKey = null;
    }
  }

  const markdown = options.markdown ?? true;
  const cleanup = options.cleanup ?? true;

  if (markdown && cleanup && !json) {
    const modelKey = config.markdownCleanupModel ?? "gpt-4o-mini";
    console.log(`Cleanup model: ${getCleanupModelLabel(modelKey)}`);
  }

  const spinner = ora(`${CLI_ICONS_COLOR.browser} Launching browser...`).start();
  const startTime = Date.now();

  let deckInfo!: DeckInfo;
  let useCachedOnly = false;
  let cacheDirFromUrl: string | null = null;

  if (!isPngFormat) {
    try {
      const urlSlug = parseDocSendUrl(url.trim());
      if (urlSlug) {
        const dir = getSlideCacheDir("docsend-" + urlSlug);
        const meta = readCacheMetadata(dir);
        if (meta && dirHasAllSlides(dir, meta.slideCount) && !options.force) {
          useCachedOnly = true;
          deckInfo = {
            title: meta.title,
            slideCount: meta.slideCount,
            imageUrls: [],
            warnings: [],
            slug: urlSlug,
          };
          cacheDirFromUrl = dir;
        }
      }
    } catch {
      // invalid URL or no slug; continue with browser
    }
  }

  if (!useCachedOnly) {
    deckInfo = await extractSlideUrls(url.trim(), {
      headless,
      profileKey,
      gateEmail: options.email?.trim() || undefined,
      debug: options.debug,
      onStatus: (msg) => (spinner.text = `${CLI_ICONS_COLOR.browser} ${msg}`),
    });
    spinner.succeed(`${CLI_ICONS_COLOR.success} Found deck: "${deckInfo.title}" (${deckInfo.slideCount} slides)`);

    if (!json && deckInfo.warnings.length > 0) {
      for (const w of deckInfo.warnings) {
        console.warn(`  Warning: ${w}`);
      }
    }

    const validCount = deckInfo.imageUrls.filter(Boolean).length;
    if (!json) {
      console.log(`Got ${validCount}/${deckInfo.slideCount} image URLs`);
    }
  } else {
    spinner.succeed(
      `${CLI_ICONS_COLOR.images} Using cached images (${deckInfo.slideCount} slides, skipping browser)`
    );
  }

  const parentOutput = resolveParentOutput(options.output, cwd);
  const deckFolderKey = deckInfo.slug ?? deckInfo.title;
  const deckDir = resolveDeckDir(parentOutput, deckFolderKey);
  mkdirSync(deckDir, { recursive: true });

  if (isPngFormat) {
    const imagesDir = join(deckDir, "images");
    mkdirSync(imagesDir, { recursive: true });

    let dlResult: { successes: number; failures: number; totalBytes: number; failedSlides: string[] };
    const useExisting = !options.force && dirHasAllSlides(imagesDir, deckInfo.slideCount);
    if (useExisting) {
      if (!json) spinner.succeed(`${CLI_ICONS_COLOR.images} Using existing slide images`);
      dlResult = {
        successes: deckInfo.slideCount,
        failures: 0,
        totalBytes: totalSlideBytesInDir(imagesDir),
        failedSlides: [],
      };
    } else {
      spinner.start(`${CLI_ICONS_COLOR.download} Downloading slides...`);
      dlResult = await downloadSlides(deckInfo.imageUrls, imagesDir, {
        concurrency: config.concurrency,
        maxRetries: config.maxRetries,
        onSlideDone: () => {},
      });
      spinner.succeed(`${CLI_ICONS_COLOR.success} Download complete`);
    }

    const slideFiles = readdirSync(imagesDir)
      .filter((f) => f.startsWith("slide_") && f.endsWith(".png"))
      .sort();
    const imagePaths = slideFiles.map((f) => join(imagesDir, f));

    let rawMd: string | null = null;
    let finalMd: string | null = null;
    const slugRawPath = join(deckDir, deckInfo.title + ".ocr.md");
    if (markdown && imagePaths.length > 0) {
      spinner.start(`${CLI_ICONS_COLOR.ocr} Extracting text (OCR)...`);
      rawMd = await ocrImagesToMarkdown(imagePaths, deckInfo.title, {
        onProgress: (cur, tot) =>
          (spinner.text = `${CLI_ICONS_COLOR.ocr} Extracting text (${cur}/${tot})...`),
      });
      writeFileSync(slugRawPath, rawMd, "utf-8");
      if (!json) spinner.succeed(`${CLI_ICONS_COLOR.markdown} Markdown written`);
    }

    let outputTitle = deckInfo.title;
    let markdownPath: string | null = null;
    let titleAiCostUsd: number | null | undefined;
    let cleanupAiCostUsd: number | null | undefined;

    const contextLimit = config.markdownContextLimitTokens ?? 32_000;

    if (imagePaths.length > 0) {
      spinner.start(`${CLI_ICONS_COLOR.deck} Detecting deck name...`);
      let titleInput: string;
      let titleMaxTokens: number;
      if (rawMd) {
        const mdTokens = estimateTokens(rawMd);
        if (mdTokens + 500 < contextLimit) {
          titleInput = rawMd;
          titleMaxTokens = contextLimit - 500;
        } else {
          const parsed = splitMarkdownIntoSlides(rawMd);
          titleInput = (parsed.slides[0]?.body ?? "").trim();
          titleMaxTokens = 500;
        }
      } else {
        titleInput = await ocrSingleImage(imagePaths[0]);
        titleMaxTokens = 500;
      }
      const titleResult = await deriveFriendlyDeckName(
        titleInput,
        deckInfo.title,
        config.markdownCleanupModel ?? "gpt-4o-mini",
        { maxInputTokens: titleMaxTokens, debug: options.debug }
      );
      outputTitle = titleResult.name;
      titleAiCostUsd = titleResult.estimatedCostUsd;
      if (!json) {
        spinner.succeed(`${CLI_ICONS_COLOR.deck} Deck: "${outputTitle}"`);
        console.log(`Using title: "${outputTitle}"`);
      }

      if (rawMd) {
        const withFriendlyHeading = applyFriendlyDeckHeading(rawMd, outputTitle, deckInfo.title);
        if (withFriendlyHeading !== rawMd) {
          rawMd = withFriendlyHeading;
          writeFileSync(slugRawPath, rawMd, "utf-8");
        }
      }

      finalMd = rawMd;
      const imagesCleanedPath = join(deckDir, outputTitle + ".md");
      const streamBufferImages = createStreamWriteBuffer(imagesCleanedPath, { json });
      if (cleanup && rawMd) {
        spinner.start(`${CLI_ICONS_COLOR.cleanup} Cleaning text...`);
        const cleanupResult = await cleanupMarkdownWithExtract(
          rawMd,
          config.markdownCleanupModel ?? "gpt-4o-mini",
          {
            onProgress: (cur, tot) =>
              (spinner.text = `${CLI_ICONS_COLOR.cleanup} Cleaning text (${cur}/${tot})...`),
            onStreamProgress: (chars, textSoFar) =>
              (spinner.text =
                textSoFar && textSoFar.length > 0
                  ? `${CLI_ICONS_COLOR.cleanup} Cleaning text… ${chars.toLocaleString()} chars | ${lastCharsPreview(textSoFar)}`
                  : `${CLI_ICONS_COLOR.cleanup} Cleaning text… ${chars.toLocaleString()} chars`),
            onStreamChunk: streamBufferImages.onChunk,
            contextLimitTokens: contextLimit,
            fullDoc: config.markdownCleanupFullDoc ?? false,
            debug: options.debug,
          }
        );
        finalMd = cleanupResult.markdown;
        cleanupAiCostUsd = cleanupResult.estimatedCostUsd;
        await streamBufferImages.flushAndClose();
        if (!json) spinner.succeed(`${CLI_ICONS_COLOR.cleanedMarkdown} Markdown cleaned`);
      }

      if (finalMd !== null) {
        const rawPath = join(deckDir, outputTitle + ".ocr.md");
        const cleanedPath = imagesCleanedPath;
        if (outputTitle !== deckInfo.title) {
          writeFileSync(rawPath, rawMd!, "utf-8");
          unlinkSync(slugRawPath);
        }
        if (cleanup && finalMd !== rawMd) {
          writeFileSync(cleanedPath, finalMd, "utf-8");
          markdownPath = cleanedPath;
        } else {
          markdownPath = outputTitle !== deckInfo.title ? rawPath : slugRawPath;
          if (cleanup && finalMd === rawMd && existsSync(imagesCleanedPath)) {
            unlinkSync(imagesCleanedPath);
          }
        }
      }
    }

    const elapsed = Date.now() - startTime;
    const summaryJsonPath = join(deckDir, "summary.json");
    const zipPath = join(deckDir, `${outputTitle}.zip`);

    const summaryPayload: DownloadSummaryResult = {
      ...dlResult,
      slideCount: deckInfo.slideCount,
      outputPath: deckDir,
      markdownPath,
      zipPath,
      imagePaths,
      ...(titleAiCostUsd !== undefined && { titleAiCostUsd }),
      ...(cleanupAiCostUsd !== undefined && { cleanupAiCostUsd }),
      ...(rawMd != null && {
        rawMarkdownChars: rawMd.length,
        rawMarkdownBytes: Buffer.byteLength(rawMd, "utf-8"),
      }),
      ...(cleanup &&
        finalMd != null &&
        finalMd !== rawMd && {
          cleanedMarkdownChars: finalMd.length,
          cleanedMarkdownBytes: Buffer.byteLength(finalMd, "utf-8"),
        }),
    };

    const extras: DownloadSummaryPayloadExtras = {
      slug: deckInfo.slug,
      deckDir,
      parentOutput,
      format: "png",
      bundleImages,
      summaryJsonPath,
    };

    writeFileSync(
      summaryJsonPath,
      JSON.stringify(
        buildDownloadSummaryPayload(summaryPayload, outputTitle, deckDir, elapsed, extras),
        null,
        2
      ),
      "utf-8"
    );

    let zipCreatedPath: string | null = null;
    if (!json) spinner.start(`${CLI_ICONS_COLOR.archive} Creating archive...`);
    try {
      const rawPath = markdownPath && isOcrMarkdownFile(markdownPath) ? markdownPath : null;
      const cleanedPath = markdownPath && isMainMarkdownFile(markdownPath) ? markdownPath : null;
      const zipImagePaths = bundleImages ? imagePaths : [];
      zipCreatedPath = await createDeckArchive(
        outputTitle,
        {
          rawMarkdown: rawPath ?? undefined,
          cleanedMarkdown: cleanedPath ?? undefined,
          summaryJson: summaryJsonPath,
          imagePaths: zipImagePaths,
          imagePathsInSubfolder: bundleImages && zipImagePaths.length > 0,
        },
        deckDir
      );
      if (!json) {
        if (zipCreatedPath) spinner.succeed(`${CLI_ICONS_COLOR.success} Archive created`);
        else spinner.succeed(`${CLI_ICONS_COLOR.info} Archive skipped (no files)`);
      }
    } catch (err) {
      if (!json) {
        spinner.warn(
          `${CLI_ICONS_COLOR.warning} Archive creation failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    summaryPayload.zipPath = zipCreatedPath;

    const summary = formatDownloadSummary(
      summaryPayload,
      outputTitle,
      deckDir,
      elapsed,
      json ? "json" : "plain",
      extras
    );
    console.log(summary);
    if (dlResult.failures > 0) process.exit(1);
    return;
  }

  const cacheDir = useCachedOnly
    ? cacheDirFromUrl!
    : getSlideCacheDir(deckInfo.slug ? "docsend-" + deckInfo.slug : deckInfo.title);

  let dlResult: { successes: number; failures: number; totalBytes: number; failedSlides: string[] };
  if (useCachedOnly) {
    dlResult = {
      successes: deckInfo.slideCount,
      failures: 0,
      totalBytes: totalSlideBytesInDir(cacheDir),
      failedSlides: [],
    };
  } else {
    const useCached = !options.force && dirHasAllSlides(cacheDir, deckInfo.slideCount);
    if (useCached) {
      if (!json) spinner.succeed(`${CLI_ICONS_COLOR.images} Using cached slide images`);
      dlResult = {
        successes: deckInfo.slideCount,
        failures: 0,
        totalBytes: totalSlideBytesInDir(cacheDir),
        failedSlides: [],
      };
    } else {
      if (options.force && existsSync(cacheDir)) {
        const { rmSync } = await import("fs");
        rmSync(cacheDir, { recursive: true, force: true });
      }
      mkdirSync(cacheDir, { recursive: true });
      spinner.start(`${CLI_ICONS_COLOR.download} Downloading slides...`);
      dlResult = await downloadSlides(deckInfo.imageUrls, cacheDir, {
        concurrency: config.concurrency,
        maxRetries: config.maxRetries,
        onSlideDone: () => {},
      });
      spinner.succeed(`${CLI_ICONS_COLOR.success} Download complete`);
    }
    writeCacheMetadata(cacheDir, { slideCount: deckInfo.slideCount, title: deckInfo.title });
  }

  const slideFiles = readdirSync(cacheDir)
    .filter((f) => f.startsWith("slide_") && f.endsWith(".png"))
    .sort();
  const imagePaths = slideFiles.map((f) => join(cacheDir, f));

  const imagesDir = join(deckDir, "images");
  let bundledImagePaths: string[] = imagePaths;
  if (bundleImages && imagePaths.length > 0) {
    copySlidesToBundleImages(cacheDir, imagesDir);
    bundledImagePaths = readdirSync(imagesDir)
      .filter((f) => f.startsWith("slide_") && f.endsWith(".png"))
      .sort()
      .map((f) => join(imagesDir, f));
  }
  const summaryImagePaths = bundleImages ? bundledImagePaths : imagePaths;

  const slugPdfPath = join(deckDir, `${deckInfo.title}.pdf`);
  let pdfSize = 0;
  if (imagePaths.length > 0) {
    spinner.start(`${CLI_ICONS_COLOR.pdf} Assembling PDF...`);
    pdfSize = await assemblePdf(imagePaths, slugPdfPath);
    spinner.succeed(`${CLI_ICONS_COLOR.success} PDF assembled`);
  }

  let rawMd: string | null = null;
  const slugRawPath = resolveMarkdownPathForPdf(slugPdfPath, "ocr");
  if (markdown && imagePaths.length > 0) {
    spinner.start(`${CLI_ICONS_COLOR.ocr} Extracting text (OCR)...`);
    rawMd = await ocrImagesToMarkdown(imagePaths, deckInfo.title, {
      onProgress: (cur, tot) =>
        (spinner.text = `${CLI_ICONS_COLOR.ocr} Extracting text (${cur}/${tot})...`),
    });
    writeFileSync(slugRawPath, rawMd, "utf-8");
    if (!json) spinner.succeed(`${CLI_ICONS_COLOR.markdown} Markdown written`);
  }

  let outputTitle = deckInfo.title;
  let finalPdfPath = slugPdfPath;
  let markdownPath: string | null = null;
  let finalMd: string | null = rawMd;
  let titleAiCostUsd: number | null | undefined;
  let cleanupAiCostUsd: number | null | undefined;

  const contextLimit = config.markdownContextLimitTokens ?? 32_000;

  if (imagePaths.length > 0) {
    spinner.start(`${CLI_ICONS_COLOR.deck} Detecting deck name...`);
    let titleInput: string;
    let titleMaxTokens: number;
    if (rawMd) {
      const mdTokens = estimateTokens(rawMd);
      if (mdTokens + 500 < contextLimit) {
        titleInput = rawMd;
        titleMaxTokens = contextLimit - 500;
      } else {
        const parsed = splitMarkdownIntoSlides(rawMd);
        titleInput = (parsed.slides[0]?.body ?? "").trim();
        titleMaxTokens = 500;
      }
    } else {
      titleInput = await ocrSingleImage(imagePaths[0]);
      titleMaxTokens = 500;
    }
    const titleResult = await deriveFriendlyDeckName(
      titleInput || "",
      deckInfo.title,
      config.markdownCleanupModel ?? "gpt-4o-mini",
      { maxInputTokens: titleMaxTokens, debug: options.debug }
    );
    outputTitle = titleResult.name;
    titleAiCostUsd = titleResult.estimatedCostUsd;
    if (!json) {
      spinner.succeed(`${CLI_ICONS_COLOR.deck} Deck: "${outputTitle}"`);
      console.log(`Using title: "${outputTitle}"`);
    }

    if (rawMd) {
      const withFriendlyHeading = applyFriendlyDeckHeading(rawMd, outputTitle, deckInfo.title);
      if (withFriendlyHeading !== rawMd) {
        rawMd = withFriendlyHeading;
        writeFileSync(slugRawPath, rawMd, "utf-8");
      }
    }

    finalMd = rawMd;
    const cleanedPathForStream =
      outputTitle !== deckInfo.title
        ? resolveMarkdownPathForPdf(join(deckDir, `${outputTitle}.pdf`), "main")
        : resolveMarkdownPathForPdf(slugPdfPath, "main");
    mkdirSync(dirname(cleanedPathForStream), { recursive: true });
    const streamBufferPdf = createStreamWriteBuffer(cleanedPathForStream, { json });
    if (cleanup && rawMd) {
      spinner.start(`${CLI_ICONS_COLOR.cleanup} Cleaning text...`);
      const cleanupResult = await cleanupMarkdownWithExtract(
        rawMd,
        config.markdownCleanupModel ?? "gpt-4o-mini",
        {
          onProgress: (cur, tot) =>
            (spinner.text = `${CLI_ICONS_COLOR.cleanup} Cleaning text (${cur}/${tot})...`),
          onStreamProgress: (chars, textSoFar) =>
            (spinner.text =
              textSoFar && textSoFar.length > 0
                ? `${CLI_ICONS_COLOR.cleanup} Cleaning text… ${chars.toLocaleString()} chars | ${lastCharsPreview(textSoFar)}`
                : `${CLI_ICONS_COLOR.cleanup} Cleaning text… ${chars.toLocaleString()} chars`),
          onStreamChunk: streamBufferPdf.onChunk,
          contextLimitTokens: contextLimit,
          fullDoc: config.markdownCleanupFullDoc ?? false,
          debug: options.debug,
        }
      );
      finalMd = cleanupResult.markdown;
      cleanupAiCostUsd = cleanupResult.estimatedCostUsd;
      await streamBufferPdf.flushAndClose();
      if (!json) spinner.succeed(`${CLI_ICONS_COLOR.cleanedMarkdown} Markdown cleaned`);
    }

    if (outputTitle !== deckInfo.title) {
      finalPdfPath = join(deckDir, `${outputTitle}.pdf`);
      renameSync(slugPdfPath, finalPdfPath);
      if (finalMd !== null) {
        const finalRawPath = resolveMarkdownPathForPdf(finalPdfPath, "ocr");
        const finalCleanedPath = resolveMarkdownPathForPdf(finalPdfPath, "main");
        writeFileSync(finalRawPath, rawMd!, "utf-8");
        unlinkSync(slugRawPath);
        if (cleanup && finalMd !== rawMd) {
          writeFileSync(finalCleanedPath, finalMd, "utf-8");
          markdownPath = finalCleanedPath;
        } else {
          markdownPath = finalRawPath;
        }
      }
    } else {
      if (finalMd !== null) {
        markdownPath = slugRawPath;
        if (cleanup && finalMd !== rawMd) {
          const slugCleanedPath = resolveMarkdownPathForPdf(slugPdfPath, "main");
          writeFileSync(slugCleanedPath, finalMd, "utf-8");
          markdownPath = slugCleanedPath;
        }
      }
    }
    if (cleanup && rawMd && finalMd === rawMd && existsSync(cleanedPathForStream)) {
      unlinkSync(cleanedPathForStream);
    }
  }

  const elapsed = Date.now() - startTime;
  const summaryJsonPath = join(deckDir, "summary.json");
  const predictedZipPath = join(deckDir, `${outputTitle}.zip`);

  const result: DownloadSummaryResult = {
    slideCount: deckInfo.slideCount,
    successes: dlResult.successes,
    failures: dlResult.failures,
    totalBytes: pdfSize || dlResult.totalBytes,
    failedSlides: dlResult.failedSlides,
    outputPath: finalPdfPath,
    markdownPath,
    zipPath: predictedZipPath as string | null,
    imagePaths: summaryImagePaths,
    ...(titleAiCostUsd !== undefined && { titleAiCostUsd }),
    ...(cleanupAiCostUsd !== undefined && { cleanupAiCostUsd }),
    ...(rawMd != null && {
      rawMarkdownChars: rawMd.length,
      rawMarkdownBytes: Buffer.byteLength(rawMd, "utf-8"),
    }),
    ...(cleanup &&
      finalMd != null &&
      finalMd !== rawMd && {
        cleanedMarkdownChars: finalMd.length,
        cleanedMarkdownBytes: Buffer.byteLength(finalMd, "utf-8"),
      }),
  };

  const extras: DownloadSummaryPayloadExtras = {
    slug: deckInfo.slug,
    deckDir,
    parentOutput,
    format: "pdf",
    bundleImages,
    summaryJsonPath,
  };

  writeFileSync(
    summaryJsonPath,
    JSON.stringify(
      buildDownloadSummaryPayload(result, outputTitle, finalPdfPath, elapsed, extras),
      null,
      2
    ),
    "utf-8"
  );

  let zipCreatedPath: string | null = null;
  if (!json) spinner.start(`${CLI_ICONS_COLOR.archive} Creating archive...`);
  try {
    const rawPath = markdownPath && isOcrMarkdownFile(markdownPath) ? markdownPath : null;
    const cleanedPath = markdownPath && isMainMarkdownFile(markdownPath) ? markdownPath : null;
    const zipImagePaths = bundleImages ? bundledImagePaths : [];
    zipCreatedPath = await createDeckArchive(
      outputTitle,
      {
        pdf: finalPdfPath,
        rawMarkdown: rawPath ?? undefined,
        cleanedMarkdown: cleanedPath ?? undefined,
        summaryJson: summaryJsonPath,
        imagePaths: zipImagePaths,
        imagePathsInSubfolder: bundleImages && zipImagePaths.length > 0,
      },
      deckDir
    );
    if (!json) {
      if (zipCreatedPath) spinner.succeed(`${CLI_ICONS_COLOR.success} Archive created`);
      else spinner.succeed(`${CLI_ICONS_COLOR.info} Archive skipped (no files)`);
    }
  } catch (err) {
    if (!json) {
      spinner.warn(
        `${CLI_ICONS_COLOR.warning} Archive creation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  result.zipPath = zipCreatedPath;

  writeFileSync(
    summaryJsonPath,
    JSON.stringify(
      buildDownloadSummaryPayload(result, outputTitle, finalPdfPath, elapsed, extras),
      null,
      2
    ),
    "utf-8"
  );

  const summary = formatDownloadSummary(
    result,
    outputTitle,
    finalPdfPath,
    elapsed,
    json ? "json" : "plain",
    extras
  );
  console.log(summary);
  if (dlResult.failures > 0) process.exit(1);
}

export function registerDownloadCommand(program: Command): void {
  program
    .command("download [url]")
    .description(
      "Download a deck into <parent>/<slug>/ (PDF default, or PNG slides with --format png). Same options as `deckli <url>`."
    )
    .option(
      "-o, --output <path>",
      "Parent directory for deck output (each deck goes to <parent>/<slug>/). A path ending in .pdf sets the parent directory only; the filename is ignored"
    )
    .addOption(
      new Option("--format <type>", "pdf (default): cache slides, assemble one PDF; png: slide PNGs only, no PDF")
        .choices(["pdf", "png"])
        .default("pdf")
    )
    .option(
      "--no-bundle-images",
      "Do not copy slides into <slug>/images/ (pdf mode) or omit slides from the zip (png mode)"
    )
    .option("--images", "Deprecated: same as --format png (prints a warning)")
    .option("-m, --markdown", "Write OCR markdown (default: on)")
    .option("--no-markdown", "Skip OCR markdown (PDF or PNG files only)")
    .option("--cleanup", "Run model cleanup on OCR text (default: on)")
    .option("--no-cleanup", "Skip cleanup; keep raw .ocr.md only")
    .option(
      "--force",
      "Re-download slides even if already present (~/.deckli/cache for pdf, or <slug>/images for png)"
    )
    .option("--no-headless", "Run the browser visibly (login, debugging)")
    .option("--json", "Print summary JSON to stdout; summary.json and zip are still written under <slug>/")
    .option("--debug", "Verbose stderr: URLs, extraction, model/title steps")
    .option(
      "--email <address>",
      "Email for require-email gates: add ?email= to the URL and auto-click Continue when the modal appears"
    )
    .action(async (url: string | undefined, options: DownloadOptions) => {
      const json = options.json ?? false;
      if (!url?.trim()) {
        const msg = "URL is required. Example: deckli https://docsend.com/view/XXXXXX";
        console.error(
          json ? JSON.stringify({ success: false, error: msg }, null, 2) : formatError(msg, "plain")
        );
        process.exit(1);
      }
      if (options.images) {
        console.warn("[deckli] --images is deprecated; use --format png");
        options = { ...options, format: "png" };
      }
      try {
        await runDownload(url, options);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (json) {
          console.error(JSON.stringify({ success: false, error: message }, null, 2));
        } else {
          console.error(formatError(message, "plain"));
        }
        process.exit(1);
      }
    });
}
