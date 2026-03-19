import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { assemblePdf } from "./assembler.js";

const MINIMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

describe("assemblePdf", () => {
  it("throws when image_paths is empty", async () => {
    const dir = join(tmpdir(), `docsend_test_${randomBytes(8).toString("hex")}`);
    mkdirSync(dir, { recursive: true });
    const outPdf = join(dir, "out.pdf");
    await expect(assemblePdf([], outPdf)).rejects.toThrow("image_paths must not be empty");
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates a PDF from PNG images", async () => {
    const dir = join(tmpdir(), `docsend_test_${randomBytes(8).toString("hex")}`);
    mkdirSync(dir, { recursive: true });
    const pngBytes = Buffer.from(MINIMAL_PNG_BASE64, "base64");
    const slide1 = join(dir, "slide_01.png");
    const slide2 = join(dir, "slide_02.png");
    writeFileSync(slide1, pngBytes);
    writeFileSync(slide2, pngBytes);
    const outPdf = join(dir, "out.pdf");

    const size = await assemblePdf([slide1, slide2], outPdf);
    expect(size).toBeGreaterThan(0);
    expect(existsSync(outPdf)).toBe(true);
    const buf = readFileSync(outPdf);
    expect(buf[0]).toBe(0x25);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x44);
    expect(buf[3]).toBe(0x46);

    rmSync(dir, { recursive: true, force: true });
  });
});
