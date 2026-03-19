import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
} from "fs";
import { basename, join } from "path";
import archiver from "archiver";

/** Copy slide_*.png from cache or source into deck `images/`. */
export function copySlidesToBundleImages(sourceDir: string, destImagesDir: string): void {
  mkdirSync(destImagesDir, { recursive: true });
  const files = readdirSync(sourceDir).filter((f) => f.startsWith("slide_") && f.endsWith(".png"));
  for (const f of files) {
    const src = join(sourceDir, f);
    if (existsSync(src)) {
      copyFileSync(src, join(destImagesDir, f));
    }
  }
}

/** Create a ZIP under outputDir: PDF/markdown/summary.json and optional images under `images/` in the archive. */
export async function createDeckArchive(
  deckTitle: string,
  files: {
    pdf?: string;
    rawMarkdown?: string;
    cleanedMarkdown?: string;
    summaryJson?: string;
    imagePaths: string[];
    imagePathsInSubfolder: boolean;
  },
  outputDir: string
): Promise<string | null> {
  const filesToAdd: Array<{ path: string; name: string }> = [];
  if (files.pdf && existsSync(files.pdf)) {
    filesToAdd.push({ path: files.pdf, name: basename(files.pdf) });
  }
  if (files.rawMarkdown && existsSync(files.rawMarkdown)) {
    filesToAdd.push({ path: files.rawMarkdown, name: basename(files.rawMarkdown) });
  }
  if (files.cleanedMarkdown && existsSync(files.cleanedMarkdown)) {
    filesToAdd.push({ path: files.cleanedMarkdown, name: basename(files.cleanedMarkdown) });
  }
  if (files.summaryJson && existsSync(files.summaryJson)) {
    filesToAdd.push({ path: files.summaryJson, name: basename(files.summaryJson) });
  }
  for (const imgPath of files.imagePaths) {
    if (existsSync(imgPath)) {
      const name = files.imagePathsInSubfolder ? `images/${basename(imgPath)}` : basename(imgPath);
      filesToAdd.push({ path: imgPath, name });
    }
  }
  if (filesToAdd.length === 0) return null;

  const zipPath = join(outputDir, `${deckTitle}.zip`);
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve(zipPath));
    archive.on("error", (err: Error) => reject(err));
    archive.pipe(output);

    for (const { path: fpath, name } of filesToAdd) {
      archive.file(fpath, { name });
    }

    archive.finalize();
  });
}
