import { describe, it, expect } from "vitest";
import { detectSource, getSourceById, getSourceIds } from "./index.js";

describe("source registry", () => {
  it("detects Canva URLs", () => {
    const source = detectSource(
      "https://www.canva.com/design/DAHEThNWfBc/4LBwmcVLZhL1Sr-QiBhXkQ/edit"
    );
    expect(source.id).toBe("canva");
  });

  it("detects DocSend URLs", () => {
    const source = detectSource("https://docsend.com/view/abc123");
    expect(source.id).toBe("docsend");
  });

  it("prioritizes Canva over DocSend", () => {
    // Canva should match before DocSend in the registry
    const canvaUrl =
      "https://www.canva.com/design/DAHEThNWfBc/4LBwmcVLZhL1Sr-QiBhXkQ/edit";
    const source = detectSource(canvaUrl);
    expect(source.id).toBe("canva");
  });

  it("getSourceById returns correct source", () => {
    expect(getSourceById("canva")?.id).toBe("canva");
    expect(getSourceById("docsend")?.id).toBe("docsend");
    expect(getSourceById("unknown")).toBeUndefined();
  });

  it("getSourceIds returns all registered sources", () => {
    const ids = getSourceIds();
    expect(ids).toContain("canva");
    expect(ids).toContain("docsend");
  });
});
