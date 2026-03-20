import { describe, it, expect } from "vitest";
import { docsendSource, appendEmailQueryParam, EXTRACT_INFO_JS } from "./docsend.js";

describe("docsendSource.canHandle", () => {
  it("accepts docsend.com/view/ URLs", () => {
    expect(docsendSource.canHandle("https://docsend.com/view/abc123")).toBe(true);
    expect(docsendSource.canHandle("http://docsend.com/view/XYZ")).toBe(true);
  });

  it("accepts subdomain docsend URLs", () => {
    expect(docsendSource.canHandle("https://dbx.docsend.com/view/abc123")).toBe(true);
    expect(docsendSource.canHandle("https://aurachatai.docsend.com/view/s/3jn2bmae9a68fvvy")).toBe(true);
    expect(docsendSource.canHandle("https://custom.docsend.com/view/abc123")).toBe(true);
  });

  it("accepts /view/s/SLUG format", () => {
    expect(docsendSource.canHandle("https://docsend.com/view/s/n43v89r")).toBe(true);
  });

  it("accepts /v/SPACE/NAME format", () => {
    expect(docsendSource.canHandle("https://docsend.com/v/space/name")).toBe(true);
  });

  it("rejects non-docsend URLs", () => {
    expect(docsendSource.canHandle("https://example.com/view/abc")).toBe(false);
    expect(docsendSource.canHandle("https://google.com/presentation/d/abc")).toBe(false);
    expect(docsendSource.canHandle("not-a-url")).toBe(false);
    expect(docsendSource.canHandle("")).toBe(false);
  });
});

describe("docsendSource.parseIdentifier", () => {
  it("returns slug for /view/ URLs", () => {
    expect(docsendSource.parseIdentifier("https://docsend.com/view/abc123")).toBe("abc123");
    expect(docsendSource.parseIdentifier("http://docsend.com/view/XYZ")).toBe("XYZ");
    expect(docsendSource.parseIdentifier("https://docsend.com/view/n43v89r")).toBe("n43v89r");
  });

  it("returns slug for subdomain URLs", () => {
    expect(docsendSource.parseIdentifier("https://dbx.docsend.com/view/abc123")).toBe("abc123");
    expect(docsendSource.parseIdentifier("https://custom.docsend.com/view/abc123")).toBe("abc123");
  });

  it("returns slug for /view/s/SLUG format", () => {
    expect(docsendSource.parseIdentifier("https://docsend.com/view/s/n43v89r")).toBe("n43v89r");
    expect(docsendSource.parseIdentifier("https://aurachatai.docsend.com/view/s/3jn2bmae9a68fvvy")).toBe(
      "3jn2bmae9a68fvvy"
    );
  });

  it("returns null for /v/SPACE/NAME URLs (slug resolved after redirect)", () => {
    expect(docsendSource.parseIdentifier("https://docsend.com/v/space/name")).toBe(null);
  });

  it("throws InvalidURLError for invalid URLs", () => {
    expect(() => docsendSource.parseIdentifier("https://example.com/view/abc")).toThrow("Invalid DocSend URL");
    expect(() => docsendSource.parseIdentifier("https://docsend.com/other/abc")).toThrow("Invalid DocSend URL");
    expect(() => docsendSource.parseIdentifier("not-a-url")).toThrow("Invalid DocSend URL");
    expect(() => docsendSource.parseIdentifier("")).toThrow("Invalid DocSend URL");
  });
});

describe("docsendSource.getProfileKey", () => {
  it("returns slug for /view/ URLs", () => {
    expect(docsendSource.getProfileKey("https://docsend.com/view/abc123")).toBe("abc123");
    expect(docsendSource.getProfileKey("https://dbx.docsend.com/view/n43v89r")).toBe("n43v89r");
  });

  it("returns slug for /view/s/SLUG URLs", () => {
    expect(docsendSource.getProfileKey("https://aurachatai.docsend.com/view/s/3jn2bmae9a68fvvy")).toBe(
      "3jn2bmae9a68fvvy"
    );
  });

  it("returns v-SPACE-NAME for /v/ URLs", () => {
    expect(docsendSource.getProfileKey("https://docsend.com/v/MySpace/deck-name")).toBe("v-MySpace-deck-name");
  });

  it("throws InvalidURLError for invalid URLs", () => {
    expect(() => docsendSource.getProfileKey("https://example.com/view/abc")).toThrow("Invalid DocSend URL");
  });
});

describe("docsendSource metadata", () => {
  it("has correct id, name, and exampleUrl", () => {
    expect(docsendSource.id).toBe("docsend");
    expect(docsendSource.name).toBe("DocSend");
    expect(docsendSource.exampleUrl).toContain("docsend.com");
  });
});

describe("appendEmailQueryParam", () => {
  it("appends email query param", () => {
    expect(appendEmailQueryParam("https://docsend.com/view/abc", "a@b.co")).toBe(
      "https://docsend.com/view/abc?email=a%40b.co"
    );
  });

  it("merges with existing query string", () => {
    expect(appendEmailQueryParam("https://docsend.com/view/abc?foo=1", "x@y.z")).toBe(
      "https://docsend.com/view/abc?foo=1&email=x%40y.z"
    );
  });

  it("returns URL unchanged for empty email", () => {
    expect(appendEmailQueryParam("https://docsend.com/view/abc", "  ")).toBe(
      "https://docsend.com/view/abc"
    );
  });
});

describe("EXTRACT_INFO_JS", () => {
  it("is an IIFE so page.evaluate(string) returns the result object not the function", () => {
    expect(EXTRACT_INFO_JS.trim().startsWith("(function()")).toBe(true);
    expect(EXTRACT_INFO_JS.trim().endsWith("})()")).toBe(true);
    expect(EXTRACT_INFO_JS).toContain("return { slideCount, title }");
  });
});
