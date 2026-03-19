import { describe, it, expect } from "vitest";
import {
  formatError,
  formatSize,
  formatEstimatedUsd,
  formatDownloadSummary,
  buildDownloadSummaryPayload,
  stripTerminalFormatting,
  shortPathLabel,
  terminalDisplayWidth,
  terminalHyperlink,
} from "./output.js";
import pc from "picocolors";

describe("formatError", () => {
  it("returns JSON when format is json", () => {
    const out = formatError("Something failed", "json");
    expect(JSON.parse(out)).toEqual({ success: false, error: "Something failed" });
  });

  it("returns plain text when format is plain", () => {
    const out = formatError("Something failed", "plain");
    expect(out).toContain("Something failed");
    expect(out).toContain("Error:");
  });
});

describe("stripTerminalFormatting", () => {
  it("removes ANSI and OSC 8 hyperlinks for width measurement", () => {
    const linked = "\x1b]8;;file:///tmp/a\x1b\\deck.md\x1b]8;;\x1b\\";
    expect(stripTerminalFormatting(`\x1b[1mHi\x1b[0m ${linked}`)).toBe("Hi deck.md");
  });
});

describe("terminalDisplayWidth", () => {
  it("ignores ANSI when measuring columns", () => {
    expect(terminalDisplayWidth(pc.bold("Hello"))).toBe(5);
  });

  it("ignores OSC 8 hyperlinks when measuring columns", () => {
    const linked = terminalHyperlink("file:///tmp/a", "deck.md");
    expect(stripTerminalFormatting(linked)).toBe("deck.md");
    expect(terminalDisplayWidth(linked)).toBe(7);
  });
});

describe("shortPathLabel", () => {
  it("uses basename for paths outside cwd", () => {
    expect(shortPathLabel("/very/long/path/to/file.pdf")).toBe("file.pdf");
  });
});

describe("formatEstimatedUsd", () => {
  it("formats dollar estimate or em dash when null", () => {
    expect(formatEstimatedUsd(0.000042)).toBe("~$0.000042");
    expect(formatEstimatedUsd(null)).toBe("—");
  });
});

describe("formatSize", () => {
  it("formats bytes", () => {
    expect(formatSize(500)).toBe("500.0 B");
  });

  it("formats KB", () => {
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
  });

  it("formats MB", () => {
    expect(formatSize(1024 * 1024)).toBe("1.0 MB");
  });
});

describe("formatDownloadSummary", () => {
  it("returns JSON when format is json", () => {
    const result = {
      successes: 10,
      failures: 0,
      totalBytes: 1024,
      failedSlides: [] as string[],
      slideCount: 10,
    };
    const out = formatDownloadSummary(result, "My Deck", "/path/to.pdf", 5000, "json");
    const parsed = JSON.parse(out);
    expect(parsed.success).toBe(true);
    expect(parsed.deckTitle).toBe("My Deck");
    expect(parsed.slideCount).toBe(10);
    expect(parsed.outputPath).toBe("/path/to.pdf");
    expect(parsed.durationMs).toBe(5000);
  });

  it("includes failures in plain output", () => {
    const result = {
      successes: 8,
      failures: 2,
      totalBytes: 800,
      failedSlides: ["slide_02.png", "slide_05.png"],
      slideCount: 10,
    };
    const out = formatDownloadSummary(result, "Deck", "/out.pdf", 1000, "plain");
    expect(out).toContain("8/10");
    expect(out).toContain("Failed");
    expect(out).toContain("slide_02.png");
  });

  it("includes markdownPath in JSON when present", () => {
    const result = {
      successes: 10,
      failures: 0,
      totalBytes: 1024,
      failedSlides: [] as string[],
      slideCount: 10,
      outputPath: "/path/to.pdf",
      markdownPath: "/path/to/deck.md",
    };
    const out = formatDownloadSummary(result, "My Deck", "/path/to.pdf", 5000, "json");
    const parsed = JSON.parse(out);
    expect(parsed.markdownPath).toBe("/path/to/deck.md");
  });

  it("includes Markdown line in plain output when markdownPath present", () => {
    const result = {
      successes: 10,
      failures: 0,
      totalBytes: 1024,
      failedSlides: [] as string[],
      slideCount: 10,
      outputPath: "/path/to.pdf",
      markdownPath: "/path/to/deck.md",
    };
    const out = formatDownloadSummary(result, "My Deck", "/path/to.pdf", 5000, "plain");
    expect(out).toContain("Markdown:");
    expect(stripTerminalFormatting(out)).toContain("deck.md");
  });

  it("includes PDF line when output is a PDF path", () => {
    const result = {
      successes: 10,
      failures: 0,
      totalBytes: 2048,
      failedSlides: [] as string[],
      slideCount: 10,
      outputPath: "/path/to/deck.pdf",
    };
    const out = formatDownloadSummary(result, "My Deck", "/path/to/deck.pdf", 1000, "plain");
    expect(out).toContain("PDF:");
    expect(out).toContain("2.0 KB");
  });

  it("includes raw and cleaned markdown chars/bytes in plain output when present", () => {
    const result = {
      successes: 10,
      failures: 0,
      totalBytes: 1024,
      failedSlides: [] as string[],
      slideCount: 10,
      outputPath: "/path/to/deck.pdf",
      rawMarkdownChars: 15000,
      rawMarkdownBytes: 15200,
      cleanedMarkdownChars: 12000,
      cleanedMarkdownBytes: 12100,
    };
    const out = formatDownloadSummary(result, "My Deck", "/path/to/deck.pdf", 1000, "plain");
    expect(out).toContain("Raw markdown:");
    expect(out).toContain("15,000 chars");
    expect(out).toContain("14.8 KB");
    expect(out).toContain("Cleaned markdown:");
    expect(out).toContain("12,000 chars");
    expect(out).toContain("11.8 KB");
  });

  it("includes AI cost lines in plain output when present", () => {
    const result = {
      successes: 10,
      failures: 0,
      totalBytes: 1024,
      failedSlides: [] as string[],
      slideCount: 10,
      outputPath: "/path/to/deck.pdf",
      titleAiCostUsd: 0.0001 as number | null,
      cleanupAiCostUsd: null as number | null,
    };
    const out = formatDownloadSummary(result, "My Deck", "/path/to/deck.pdf", 1000, "plain");
    expect(stripTerminalFormatting(out)).toContain("AI title (est.):");
    expect(stripTerminalFormatting(out)).toContain("~$0.000100");
    expect(stripTerminalFormatting(out)).toContain("AI cleanup (est.):");
    expect(stripTerminalFormatting(out)).toContain("AI cleanup (est.): —");
  });

  it("includes rawMarkdownChars and cleanedMarkdownChars in JSON when present", () => {
    const result = {
      successes: 10,
      failures: 0,
      totalBytes: 1024,
      failedSlides: [] as string[],
      slideCount: 10,
      outputPath: "/path/to.pdf",
      rawMarkdownChars: 5000,
      rawMarkdownBytes: 5100,
      cleanedMarkdownChars: 4500,
      cleanedMarkdownBytes: 4600,
    };
    const out = formatDownloadSummary(result, "My Deck", "/path/to.pdf", 1000, "json");
    const parsed = JSON.parse(out);
    expect(parsed.rawMarkdownChars).toBe(5000);
    expect(parsed.rawMarkdownBytes).toBe(5100);
    expect(parsed.cleanedMarkdownChars).toBe(4500);
    expect(parsed.cleanedMarkdownBytes).toBe(4600);
  });

  it("buildDownloadSummaryPayload includes optional extras", () => {
    const result = {
      successes: 10,
      failures: 0,
      totalBytes: 1024,
      failedSlides: [] as string[],
      slideCount: 10,
      outputPath: "/deck/out.pdf",
    };
    const payload = buildDownloadSummaryPayload(result, "Deck", "/deck/out.pdf", 1000, {
      slug: "abc123",
      deckDir: "/parent/abc123",
      parentOutput: "/parent",
      format: "pdf",
      bundleImages: true,
      summaryJsonPath: "/parent/abc123/summary.json",
    });
    expect(payload.slug).toBe("abc123");
    expect(payload.deckDir).toBe("/parent/abc123");
    expect(payload.format).toBe("pdf");
    expect(payload.bundleImages).toBe(true);
  });

  it("includes titleAiCostUsd and cleanupAiCostUsd in JSON when present", () => {
    const result = {
      successes: 10,
      failures: 0,
      totalBytes: 1024,
      failedSlides: [] as string[],
      slideCount: 10,
      outputPath: "/path/to.pdf",
      titleAiCostUsd: null,
      cleanupAiCostUsd: 0.05,
    };
    const out = formatDownloadSummary(result, "My Deck", "/path/to.pdf", 1000, "json");
    const parsed = JSON.parse(out);
    expect(parsed.titleAiCostUsd).toBeNull();
    expect(parsed.cleanupAiCostUsd).toBe(0.05);
  });
});
