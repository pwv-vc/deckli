import { describe, it, expect } from "vitest";
import {
  parseDocSendUrl,
  getProfileKeyFromUrl,
  EXTRACT_INFO_JS,
} from "./extractor.js";

describe("parseDocSendUrl", () => {
  it("accepts valid docsend.com/view/ URLs", () => {
    expect(parseDocSendUrl("https://docsend.com/view/abc123")).toBe("abc123");
    expect(parseDocSendUrl("http://docsend.com/view/XYZ")).toBe("XYZ");
    expect(parseDocSendUrl("https://docsend.com/view/n43v89r")).toBe("n43v89r");
  });

  it("accepts valid dbx.docsend.com/view/ URLs", () => {
    expect(parseDocSendUrl("https://dbx.docsend.com/view/abc123")).toBe("abc123");
  });

  it("accepts custom subdomain docsend URLs (e.g. aurachatai.docsend.com)", () => {
    expect(parseDocSendUrl("https://aurachatai.docsend.com/view/s/3jn2bmae9a68fvvy")).toBe(
      "3jn2bmae9a68fvvy"
    );
    expect(parseDocSendUrl("https://custom.docsend.com/view/abc123")).toBe("abc123");
  });

  it("accepts /view/s/SLUG format", () => {
    expect(parseDocSendUrl("https://docsend.com/view/s/n43v89r")).toBe("n43v89r");
  });

  it("accepts /v/SPACE/NAME URLs and returns null (slug from redirect)", () => {
    expect(parseDocSendUrl("https://docsend.com/v/space/name")).toBe(null);
  });

  it("throws InvalidURLError for invalid URLs", () => {
    expect(() => parseDocSendUrl("https://example.com/view/abc")).toThrow("Invalid DocSend URL");
    expect(() => parseDocSendUrl("https://docsend.com/other/abc")).toThrow("Invalid DocSend URL");
    expect(() => parseDocSendUrl("not-a-url")).toThrow("Invalid DocSend URL");
    expect(() => parseDocSendUrl("")).toThrow("Invalid DocSend URL");
  });
});

describe("getProfileKeyFromUrl", () => {
  it("returns slug for /view/ URLs", () => {
    expect(getProfileKeyFromUrl("https://docsend.com/view/abc123")).toBe("abc123");
    expect(getProfileKeyFromUrl("https://dbx.docsend.com/view/n43v89r")).toBe("n43v89r");
  });

  it("returns slug for custom subdomain and /view/s/SLUG URLs", () => {
    expect(getProfileKeyFromUrl("https://aurachatai.docsend.com/view/s/3jn2bmae9a68fvvy")).toBe(
      "3jn2bmae9a68fvvy"
    );
  });

  it("returns v-SPACE-NAME for /v/ URLs", () => {
    expect(getProfileKeyFromUrl("https://docsend.com/v/MySpace/deck-name")).toBe("v-MySpace-deck-name");
  });

  it("throws for invalid URLs", () => {
    expect(() => getProfileKeyFromUrl("https://example.com/view/abc")).toThrow("Invalid DocSend URL");
  });
});

describe("EXTRACT_INFO_JS", () => {
  it("is an IIFE so page.evaluate(string) returns the result object not the function", () => {
    expect(EXTRACT_INFO_JS.trim().startsWith("(function()")).toBe(true);
    expect(EXTRACT_INFO_JS.trim().endsWith("})()")).toBe(true);
    expect(EXTRACT_INFO_JS).toContain("return { slideCount, title }");
  });
});

