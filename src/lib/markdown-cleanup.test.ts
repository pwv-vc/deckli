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
  normalizeMarkdownSpacing,
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

  it("parses ## Slide N: Title headings produced by cleanup", () => {
    const raw = `# My Deck

## Slide 1: Product Overview

First slide content.

---

## Slide 2: Market Size

Second slide content.

---
`;
    const parsed = splitMarkdownIntoSlides(raw);
    expect(parsed.slides).toHaveLength(2);
    expect(parsed.slides[0].index).toBe(1);
    expect(parsed.slides[0].body).toContain("First slide content");
    expect(parsed.slides[1].index).toBe(2);
    expect(parsed.slides[1].body).toContain("Second slide content");
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

  it("promotes # Title from cleaned body into ## Slide N: Title heading", () => {
    const parsed = {
      title: "My Deck",
      slides: [
        { index: 1, body: "raw body" },
        { index: 2, body: "raw body" },
      ],
    };
    const out = reassembleMarkdown(parsed, [
      "# Product Overview\n\nSome content here.",
      "# Market Size\n\nMore content.",
    ]);
    expect(out).toContain("## Slide 1: Product Overview");
    expect(out).toContain("Some content here.");
    expect(out).not.toContain("# Product Overview");
    expect(out).toContain("## Slide 2: Market Size");
    expect(out).toContain("More content.");
    expect(out).not.toContain("# Market Size");
  });

  it("leaves ## Slide N heading unchanged when cleaned body has no # title", () => {
    const parsed = {
      title: "My Deck",
      slides: [{ index: 1, body: "raw" }],
    };
    const out = reassembleMarkdown(parsed, ["No title here, just content."]);
    expect(out).toContain("## Slide 1\n");
    expect(out).not.toContain("## Slide 1:");
  });

  it("removes echoed title when model repeats it as first body line", () => {
    const parsed = {
      title: "My Deck",
      slides: [{ index: 1, body: "raw" }],
    };
    const out = reassembleMarkdown(parsed, [
      "# Product Overview\nProduct Overview\n\nSome content.",
    ]);
    expect(out).toContain("## Slide 1: Product Overview");
    const bodySection = out.split("## Slide 1: Product Overview")[1];
    // "Product Overview" should not appear again as a standalone line
    expect(bodySection?.trim().startsWith("Product Overview\n\nSome content")).toBe(false);
    expect(out).toContain("Some content.");
  });

  it("collapses excessive blank lines in cleaned body", () => {
    const parsed = {
      title: "My Deck",
      slides: [{ index: 1, body: "raw" }],
    };
    const out = reassembleMarkdown(parsed, ["Line one.\n\n\n\n\nLine two."]);
    expect(out).not.toMatch(/\n{3,}/);
    expect(out).toContain("Line one.");
    expect(out).toContain("Line two.");
  });
});

describe("normalizeMarkdownSpacing", () => {
  it("ensures blank line after heading when content follows immediately", () => {
    const input = "## Slide 1: Title\nContent here.";
    const out = normalizeMarkdownSpacing(input);
    expect(out).toBe("## Slide 1: Title\n\nContent here.");
  });

  it("ensures blank line before heading when preceded by content", () => {
    const input = "Some text.\n## Slide 2: Next";
    const out = normalizeMarkdownSpacing(input);
    expect(out).toBe("Some text.\n\n## Slide 2: Next");
  });

  it("collapses 3+ blank lines to 2", () => {
    const input = "Para one.\n\n\n\nPara two.";
    const out = normalizeMarkdownSpacing(input);
    expect(out).toBe("Para one.\n\nPara two.");
  });

  it("leaves already-correct spacing unchanged", () => {
    const input = "## Heading\n\nContent.\n\nMore content.";
    expect(normalizeMarkdownSpacing(input)).toBe(input);
  });

  it("unescapes literal \\n sequences the model may output instead of real newlines", () => {
    const input = "# Title\\n\\n## Slide 1: Heading\\nContent here.";
    const out = normalizeMarkdownSpacing(input);
    expect(out).toBe("# Title\n\n## Slide 1: Heading\n\nContent here.");
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
    expect(result.markdown).toBe(raw);
    expect(result.estimatedCostUsd).toBeNull();
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
