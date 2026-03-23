import { describe, it, expect } from "vitest";
import { canvaSource } from "./canva.js";

describe("canvaSource.canHandle", () => {
  it("accepts canva.com/design/ URLs with www", () => {
    expect(
      canvaSource.canHandle(
        "https://www.canva.com/design/DAHEThNWfBc/4LBwmcVLZhL1Sr-QiBhXkQ/edit"
      )
    ).toBe(true);
  });

  it("accepts canva.com/design/ URLs without www", () => {
    expect(
      canvaSource.canHandle(
        "https://canva.com/design/ABC123/XYZ789/edit"
      )
    ).toBe(true);
  });

  it("accepts canva.com/design/ URLs without /edit", () => {
    expect(
      canvaSource.canHandle(
        "https://www.canva.com/design/ABC123/XYZ789"
      )
    ).toBe(true);
  });

  it("rejects non-canva URLs", () => {
    expect(
      canvaSource.canHandle("https://docsend.com/view/abc")
    ).toBe(false);
    expect(
      canvaSource.canHandle("https://google.com")
    ).toBe(false);
  });

  it("rejects malformed canva URLs", () => {
    expect(
      canvaSource.canHandle("https://www.canva.com/templates/")
    ).toBe(false);
    expect(
      canvaSource.canHandle("https://www.canva.com/design/ABC")
    ).toBe(false);
  });
});

describe("canvaSource.parseIdentifier", () => {
  it("extracts design ID from standard URL", () => {
    expect(
      canvaSource.parseIdentifier(
        "https://www.canva.com/design/DAHEThNWfBc/4LBwmcVLZhL1Sr-QiBhXkQ/edit"
      )
    ).toBe("DAHEThNWfBc");
  });

  it("extracts design ID from URL without /edit", () => {
    expect(
      canvaSource.parseIdentifier(
        "https://www.canva.com/design/ABC123/XYZ789"
      )
    ).toBe("ABC123");
  });

  it("handles utm params", () => {
    expect(
      canvaSource.parseIdentifier(
        "https://www.canva.com/design/ABC123/XYZ789/edit?utm_source=twitter&utm_medium=social"
      )
    ).toBe("ABC123");
  });

  it("returns null for invalid URLs", () => {
    expect(
      canvaSource.parseIdentifier("https://docsend.com/view/abc")
    ).toBeNull();
    expect(
      canvaSource.parseIdentifier("https://www.canva.com/templates/")
    ).toBeNull();
  });
});

describe("canvaSource.getProfileKey", () => {
  it("returns canva-{designId} format", () => {
    expect(
      canvaSource.getProfileKey(
        "https://www.canva.com/design/DAHEThNWfBc/4LBwmcVLZhL1Sr-QiBhXkQ/edit"
      )
    ).toBe("canva-DAHEThNWfBc");
  });

  it("handles different design IDs", () => {
    expect(
      canvaSource.getProfileKey(
        "https://www.canva.com/design/ABC123/XYZ789"
      )
    ).toBe("canva-ABC123");
  });
});
