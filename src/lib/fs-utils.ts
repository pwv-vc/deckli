import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

/** List all slide_*.png files in a directory, sorted by name. */
export function listSlideFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.startsWith("slide_") && f.endsWith(".png"))
    .sort();
}

/** Sum byte size of slide_*.png files in a directory. */
export function totalSlideBytesInDir(dir: string): number {
  const files = listSlideFiles(dir).slice(0, 200);
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

/** True if dir contains slide_01.png through slide_{expectedCount}.png. */
export function dirHasAllSlides(dir: string, expectedCount: number): boolean {
  if (!existsSync(dir) || expectedCount <= 0) return false;
  for (let i = 1; i <= expectedCount; i++) {
    const name = `slide_${String(i).padStart(2, "0")}.png`;
    if (!existsSync(join(dir, name))) return false;
  }
  return true;
}
