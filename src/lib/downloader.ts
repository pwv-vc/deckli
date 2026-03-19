import { writeFileSync } from "fs";
import { join } from "path";
import type { DownloadResult } from "./types.js";
import { USER_AGENT } from "./constants.js";

const DEFAULT_CONCURRENCY = 10;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

async function downloadOne(
  url: string,
  outputPath: string,
  semaphore: { acquire: () => Promise<void>; release: () => void },
  options: {
    maxRetries: number;
    timeoutMs: number;
  }
): Promise<number | null> {
  await semaphore.acquire();
  try {
    for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(options.timeoutMs),
          headers: { "User-Agent": USER_AGENT },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        writeFileSync(outputPath, Buffer.from(buf));
        return buf.byteLength;
      } catch {
        if (attempt === options.maxRetries) return null;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    return null;
  } finally {
    semaphore.release();
  }
}

function createSemaphore(concurrency: number): {
  acquire: () => Promise<void>;
  release: () => void;
} {
  let running = 0;
  const queue: (() => void)[] = [];
  return {
    acquire: () =>
      new Promise((resolve) => {
        if (running < concurrency) {
          running++;
          resolve();
        } else {
          queue.push(() => {
            running++;
            resolve();
          });
        }
      }),
    release: () => {
        running--;
        const next = queue.shift();
        if (next) next();
      },
  };
}

export interface DownloadSlidesOptions {
  concurrency?: number;
  maxRetries?: number;
  timeoutMs?: number;
  onSlideDone?: () => void;
}

export async function downloadSlides(
  urls: (string | null)[],
  outputDir: string,
  options: DownloadSlidesOptions = {}
): Promise<DownloadResult> {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    maxRetries = DEFAULT_MAX_RETRIES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onSlideDone,
  } = options;

  const semaphore = createSemaphore(concurrency);
  const result: DownloadResult = {
    successes: 0,
    failures: 0,
    totalBytes: 0,
    failedSlides: [],
  };

  const tasks: Promise<void>[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const num = String(i + 1).padStart(2, "0");
    const outputPath = join(outputDir, `slide_${num}.png`);

    if (url == null) {
      onSlideDone?.();
      continue;
    }

    tasks.push(
      downloadOne(url, outputPath, semaphore, { maxRetries, timeoutMs }).then(
        (size) => {
          if (size != null) {
            result.successes++;
            result.totalBytes += size;
          } else {
            result.failures++;
            result.failedSlides.push(`slide_${num}.png`);
          }
          onSlideDone?.();
        }
      )
    );
  }

  await Promise.all(tasks);
  return result;
}
