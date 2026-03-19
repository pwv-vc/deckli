import { createWriteStream } from "fs";

/** Last N chars of streamed text for CLI progress preview (single line, sanitized). */
export function lastCharsPreview(text: string, maxLen: number = 40): string {
  if (!text) return "";
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return "…" + oneLine.slice(-maxLen);
}

const STREAM_WRITE_BATCH_BYTES = 1024;

/** Batched write of streamed chunks to a file; call flushAndClose() after cleanup to write remainder and close. */
export function createStreamWriteBuffer(
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
