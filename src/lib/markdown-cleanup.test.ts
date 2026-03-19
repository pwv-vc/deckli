import { describe, it, expect } from "vitest";
import {
  splitMarkdownIntoSlides,
  reassembleMarkdown,
  cleanupMarkdownWithExtract,
  sanitizeFriendlyDeckName,
  isPromptLeak,
  estimateTokens,
  looksLikeStructuredOutput,
  getCleanupModelLabel,
} from "./markdown-cleanup.js";

describe("splitMarkdownIntoSlides", () => {
  it("extracts title and slide bodies", () => {
    const raw = `# My Deck

## Slide 1

First slide OCR text here.

---

## Slide 2

Second slide content.

---
`;
    const parsed = splitMarkdownIntoSlides(raw);
    expect(parsed.title).toBe("My Deck");
    expect(parsed.slides).toHaveLength(2);
    expect(parsed.slides[0].index).toBe(1);
    expect(parsed.slides[0].body).toContain("First slide OCR");
    expect(parsed.slides[1].index).toBe(2);
    expect(parsed.slides[1].body).toContain("Second slide content");
  });

  it("returns empty slides for markdown with no ## Slide", () => {
    const raw = `# Only Title

Some text without slide headers.
`;
    const parsed = splitMarkdownIntoSlides(raw);
    expect(parsed.title).toBe("Only Title");
    expect(parsed.slides).toHaveLength(0);
  });

  it("strips trailing --- from slide bodies", () => {
    const raw = `# Deck

## Slide 1

Body text

---
`;
    const parsed = splitMarkdownIntoSlides(raw);
    expect(parsed.slides[0].body).not.toContain("---");
    expect(parsed.slides[0].body.trim()).toBe("Body text");
  });
});

describe("reassembleMarkdown", () => {
  it("reassembles title and cleaned bodies with same structure", () => {
    const parsed = {
      title: "My Deck",
      slides: [
        { index: 1, body: "First" },
        { index: 2, body: "Second" },
      ],
    };
    const out = reassembleMarkdown(parsed, ["Cleaned first", "Cleaned second"]);
    expect(out).toContain("# My Deck");
    expect(out).toContain("## Slide 1");
    expect(out).toContain("Cleaned first");
    expect(out).toContain("## Slide 2");
    expect(out).toContain("Cleaned second");
    expect(out).toContain("---");
  });
});

describe("getCleanupModelLabel", () => {
  it("labels OpenAI models", () => {
    expect(getCleanupModelLabel("gpt-4o-mini")).toBe("gpt-4o-mini (OpenAI)");
  });

  it("labels local ONNX models", () => {
    expect(getCleanupModelLabel("350m")).toContain("350m");
    expect(getCleanupModelLabel("350m")).toContain("onnx-community");
  });
});

describe("looksLikeStructuredOutput", () => {
  it("returns true for XML declaration so fallback is used instead of writing XML to cleaned file", () => {
    expect(looksLikeStructuredOutput("<?xml version=\"1.0\" encoding=\"utf-8\"?>")).toBe(true);
    expect(looksLikeStructuredOutput("  <?xml")).toBe(true);
  });

  it("returns true for XML-like and JSON-like output", () => {
    expect(looksLikeStructuredOutput("<data>")).toBe(true);
    expect(looksLikeStructuredOutput("<slides><title>")).toBe(true);
    expect(looksLikeStructuredOutput("{")).toBe(true);
    expect(looksLikeStructuredOutput('{"markdown": "x"}')).toBe(true);
  });

  it("returns false for plain markdown so it is accepted as cleaned output", () => {
    expect(looksLikeStructuredOutput("# Title\n\nParagraph.")).toBe(false);
    expect(looksLikeStructuredOutput("Plain text only")).toBe(false);
    expect(looksLikeStructuredOutput("")).toBe(false);
  });
});

describe("cleanupMarkdownWithExtract", () => {
  it("returns raw markdown unchanged when there are no slide sections", async () => {
    const raw = `# Deck

No ## Slide headers here.
`;
    const result = await cleanupMarkdownWithExtract(raw, "350m");
    expect(result).toBe(raw);
  });
});

describe("sanitizeFriendlyDeckName", () => {
  it("adds -deck suffix when missing", () => {
    expect(sanitizeFriendlyDeckName("AcmeCorp")).toBe("AcmeCorp-deck");
    expect(sanitizeFriendlyDeckName("Acme Product")).toBe("Acme-Product-deck");
  });

  it("keeps existing -deck suffix", () => {
    expect(sanitizeFriendlyDeckName("AcmeCorp-deck")).toBe("AcmeCorp-deck");
  });

  it("replaces spaces with hyphens and strips invalid chars", () => {
    expect(sanitizeFriendlyDeckName("Acme Corp  Product Name")).toBe("Acme-Corp-Product-Name-deck");
    expect(sanitizeFriendlyDeckName("Acme (Product) v2!")).toBe("Acme-Product-v2-deck");
  });

  it("returns empty string for empty or only-symbols input", () => {
    expect(sanitizeFriendlyDeckName("")).toBe("");
    expect(sanitizeFriendlyDeckName("   ")).toBe("");
    expect(sanitizeFriendlyDeckName("---")).toBe("");
  });
});

describe("estimateTokens", () => {
  it("returns ceil(length/4) for non-empty strings", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("a".repeat(8))).toBe(2);
    expect(estimateTokens("a".repeat(4000))).toBe(1000);
  });
});

describe("isPromptLeak", () => {
  it("returns true for prompt-like or instruction phrases", () => {
    expect(isPromptLeak("system-From-the-following-slide-text-extract-the-company-name-andor-product-name")).toBe(true);
    expect(isPromptLeak("From the following slide text")).toBe(true);
    expect(isPromptLeak("extract the company name")).toBe(true);
    expect(isPromptLeak("andor")).toBe(true);
    expect(isPromptLeak("nothing else")).toBe(true);
  });

  it("returns true for empty or very long strings", () => {
    expect(isPromptLeak("")).toBe(true);
    expect(isPromptLeak("a".repeat(51))).toBe(true);
  });

  it("returns false for valid deck names", () => {
    expect(isPromptLeak("AcmeCorp-deck")).toBe(false);
    expect(isPromptLeak("MyProduct-deck")).toBe(false);
    expect(isPromptLeak("Acme-Product-Name-deck")).toBe(false);
  });
});
