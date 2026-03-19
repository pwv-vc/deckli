import { describe, it, expect, vi } from "vitest";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  applyFriendlyDeckHeading,
  buildMarkdownFromTexts,
  deckHeadingFromFriendlyFilename,
  ocrImagesToMarkdown,
  replaceMarkdownDocumentH1,
} from "./ocr-markdown.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "__fixtures__");
const OCR_TEST_IMAGE = join(FIXTURES_DIR, "ocr-test.png");

vi.mock("tesseract.js", () => ({
  createWorker: vi.fn(() =>
    Promise.resolve({
      recognize: vi.fn(() => Promise.resolve({ data: { text: "Hello OCR" } })),
      terminate: vi.fn(() => Promise.resolve()),
    })
  ),
}));

describe("buildMarkdownFromTexts", () => {
  it("produces markdown with # title and ## Slide N", () => {
    const md = buildMarkdownFromTexts(["First slide text.", "Second slide."], "My Deck");
    expect(md).toContain("# My Deck");
    expect(md).toContain("## Slide 1");
    expect(md).toContain("First slide text.");
    expect(md).toContain("## Slide 2");
    expect(md).toContain("Second slide.");
  });

  it("escapes # in deck title", () => {
    const md = buildMarkdownFromTexts(["Hi"], "Topic #1");
    expect(md).toContain("# Topic 1");
    expect(md).not.toMatch(/#.*#.*#/);
  });

  it("uses 'Deck' when title is empty after trim", () => {
    const md = buildMarkdownFromTexts([], "   ");
    expect(md).toContain("# Deck");
  });

  it("handles empty slide text", () => {
    const md = buildMarkdownFromTexts(["", "Only second"], "Deck");
    expect(md).toContain("## Slide 1");
    expect(md).toContain("## Slide 2");
    expect(md).toContain("Only second");
  });

  it("includes separator between slides", () => {
    const md = buildMarkdownFromTexts(["A", "B"], "Deck");
    expect(md).toContain("---");
  });
});

describe("deckHeadingFromFriendlyFilename", () => {
  it("strips -deck and turns hyphens into spaces", () => {
    expect(deckHeadingFromFriendlyFilename("RenewablesBridge-deck")).toBe("RenewablesBridge");
    expect(deckHeadingFromFriendlyFilename("Acme-Corp-Product-deck")).toBe("Acme Corp Product");
  });
});

describe("replaceMarkdownDocumentH1", () => {
  it("replaces first # line", () => {
    const md = `# docsend-abc123\n\n## Slide 1\n\nHi`;
    expect(replaceMarkdownDocumentH1(md, "My Deck")).toBe(`# My Deck\n\n## Slide 1\n\nHi`);
  });
});

describe("applyFriendlyDeckHeading", () => {
  it("updates slug heading when output title differs", () => {
    const raw = `# docsend-abc\n\n## Slide 1\n\nx`;
    const out = applyFriendlyDeckHeading(raw, "RenewablesBridge-deck", "docsend-abc");
    expect(out.startsWith("# RenewablesBridge\n")).toBe(true);
  });

  it("leaves markdown unchanged when friendly name matches deck title", () => {
    const raw = "# Same\n\n## Slide 1\n\n";
    expect(applyFriendlyDeckHeading(raw, "Same", "Same")).toBe(raw);
  });
});

describe("ocrImagesToMarkdown", () => {
  it("returns markdown with title and slide heading when given fixture image", async () => {
    const md = await ocrImagesToMarkdown([OCR_TEST_IMAGE], "Test Deck");
    expect(md).toContain("# Test Deck");
    expect(md).toContain("## Slide 1");
    expect(md).toContain("Hello OCR");
    expect(md.length).toBeGreaterThan(10);
  });

  it("calls onProgress for each image", async () => {
    const progress: [number, number][] = [];
    await ocrImagesToMarkdown([OCR_TEST_IMAGE, OCR_TEST_IMAGE], "Deck", {
      onProgress: (cur, tot) => progress.push([cur, tot]),
    });
    expect(progress).toEqual([[1, 2], [2, 2]]);
  });
});
