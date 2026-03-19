import { readFileSync, writeFileSync } from "fs";
import { PDFDocument } from "pdf-lib";

export async function assemblePdf(
  imagePaths: string[],
  outputPath: string
): Promise<number> {
  if (imagePaths.length === 0) {
    throw new Error("image_paths must not be empty");
  }

  const doc = await PDFDocument.create();

  const defaultWidth = 612;
  const defaultHeight = 792;

  for (const p of imagePaths) {
    const bytes = readFileSync(p);
    const img = await doc.embedPng(bytes);
    const scaled = img.scale(1);
    const w = Number(scaled.width);
    const h = Number(scaled.height);
    const width = Number.isFinite(w) && w > 0 ? w : defaultWidth;
    const height = Number.isFinite(h) && h > 0 ? h : defaultHeight;
    const page = doc.addPage([width, height]);
    page.drawImage(img, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  const pdfBytes = await doc.save();
  writeFileSync(outputPath, pdfBytes);
  return pdfBytes.length;
}
