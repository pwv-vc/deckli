import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, statSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { copySlidesToBundleImages, createDeckArchive } from "./deck-output.js";

describe("copySlidesToBundleImages", () => {
  let base: string;

  beforeEach(() => {
    base = join(tmpdir(), `deck-out-${randomBytes(8).toString("hex")}`);
    mkdirSync(join(base, "src"), { recursive: true });
    writeFileSync(join(base, "src", "slide_01.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(join(base, "src", "slide_02.png"), Buffer.from([1, 2, 3]));
    writeFileSync(join(base, "src", "other.txt"), "ignore");
  });

  afterEach(() => {
    if (existsSync(base)) {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("copies only slide_*.png into dest images dir", () => {
    const dest = join(base, "deck", "images");
    copySlidesToBundleImages(join(base, "src"), dest);
    expect(existsSync(join(dest, "slide_01.png"))).toBe(true);
    expect(existsSync(join(dest, "slide_02.png"))).toBe(true);
    expect(existsSync(join(dest, "other.txt"))).toBe(false);
    expect(readFileSync(join(dest, "slide_01.png"))).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });
});

describe("createDeckArchive", () => {
  let base: string;

  beforeEach(() => {
    base = join(tmpdir(), `deck-zip-${randomBytes(8).toString("hex")}`);
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, "deck.pdf"), "%PDF-1.4 test");
    writeFileSync(join(base, "raw.ocr.md"), "# raw");
    writeFileSync(join(base, "clean.md"), "# clean");
    writeFileSync(join(base, "summary.json"), "{}");
    mkdirSync(join(base, "images"), { recursive: true });
    writeFileSync(join(base, "images", "slide_01.png"), "png1");
  });

  afterEach(() => {
    if (existsSync(base)) {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("returns null when no input files exist", async () => {
    const empty = join(base, "empty");
    mkdirSync(empty, { recursive: true });
    const out = await createDeckArchive(
      "Empty",
      {
        pdf: join(empty, "missing.pdf"),
        rawMarkdown: join(empty, "missing.md"),
        cleanedMarkdown: undefined,
        summaryJson: undefined,
        imagePaths: [],
        imagePathsInSubfolder: false,
      },
      empty
    );
    expect(out).toBeNull();
  });

  it("creates a zip with flat image names when imagePathsInSubfolder is false", async () => {
    const zipPath = await createDeckArchive(
      "MyDeck",
      {
        pdf: join(base, "deck.pdf"),
        rawMarkdown: join(base, "raw.ocr.md"),
        imagePaths: [join(base, "images", "slide_01.png")],
        imagePathsInSubfolder: false,
      },
      base
    );
    expect(zipPath).toBe(join(base, "MyDeck.zip"));
    expect(existsSync(zipPath!)).toBe(true);
    expect(statSync(zipPath!).size).toBeGreaterThan(0);
    const buf = readFileSync(zipPath!);
    expect(buf.includes(Buffer.from("slide_01.png"))).toBe(true);
    expect(buf.includes(Buffer.from("images/slide_01.png"))).toBe(false);
  });

  it("creates a zip with images/ prefix when imagePathsInSubfolder is true", async () => {
    const zipPath = await createDeckArchive(
      "MyDeck",
      {
        pdf: join(base, "deck.pdf"),
        summaryJson: join(base, "summary.json"),
        imagePaths: [join(base, "images", "slide_01.png")],
        imagePathsInSubfolder: true,
      },
      base
    );
    expect(zipPath).toBe(join(base, "MyDeck.zip"));
    const buf = readFileSync(zipPath!);
    expect(buf.includes(Buffer.from("images/slide_01.png"))).toBe(true);
    expect(buf.includes(Buffer.from("summary.json"))).toBe(true);
  });
});
