import { describe, it, expect } from "vitest";
import {
  parseDocSendUrl,
  getProfileKeyFromUrl,
  appendEmailQueryParam,
  EXTRACT_INFO_JS,
  extractSlideUrls,
} from "./extractor.js";

describe("extractor.ts shim", () => {
  it("parseDocSendUrl delegates to docsendSource.parseIdentifier", () => {
    expect(parseDocSendUrl("https://docsend.com/view/abc123")).toBe("abc123");
    expect(parseDocSendUrl("https://docsend.com/v/space/name")).toBe(null);
    expect(() => parseDocSendUrl("https://example.com/view/abc")).toThrow("Invalid DocSend URL");
  });

  it("getProfileKeyFromUrl delegates to docsendSource.getProfileKey", () => {
    expect(getProfileKeyFromUrl("https://docsend.com/view/abc123")).toBe("abc123");
    expect(getProfileKeyFromUrl("https://docsend.com/v/MySpace/deck-name")).toBe("v-MySpace-deck-name");
    expect(() => getProfileKeyFromUrl("https://example.com/view/abc")).toThrow("Invalid DocSend URL");
  });

  it("appendEmailQueryParam is re-exported from docsend source", () => {
    expect(appendEmailQueryParam("https://docsend.com/view/abc", "a@b.co")).toBe(
      "https://docsend.com/view/abc?email=a%40b.co"
    );
    expect(appendEmailQueryParam("https://docsend.com/view/abc", "  ")).toBe(
      "https://docsend.com/view/abc"
    );
  });

  it("EXTRACT_INFO_JS is re-exported from docsend source", () => {
    expect(EXTRACT_INFO_JS.trim().startsWith("(function()")).toBe(true);
    expect(EXTRACT_INFO_JS.trim().endsWith("})()")).toBe(true);
    expect(EXTRACT_INFO_JS).toContain("return { slideCount, title }");
  });

  it("extractSlideUrls is exported as a function that delegates to docsendSource", () => {
    expect(typeof extractSlideUrls).toBe("function");
    expect(extractSlideUrls.constructor.name).toBe("AsyncFunction");
  });
});
