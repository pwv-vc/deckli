import { describe, it, expect } from "vitest";
import {
  isOpenAiModelKey,
  OPENAI_FULL_DOC_CONTEXT_BUDGET_TOKENS,
  OPENAI_MAX_COMPLETION_TOKENS,
} from "./openai-cleanup.js";

describe("isOpenAiModelKey", () => {
  it("returns true for OpenAI chat model ids", () => {
    expect(isOpenAiModelKey("gpt-4o-mini")).toBe(true);
    expect(isOpenAiModelKey("gpt-4o")).toBe(true);
  });

  it("returns false for local ONNX keys", () => {
    expect(isOpenAiModelKey("350m")).toBe(false);
    expect(isOpenAiModelKey("1.2b")).toBe(false);
  });
});

describe("OPENAI_FULL_DOC_CONTEXT_BUDGET_TOKENS", () => {
  it("is a positive budget for single-request cleanup", () => {
    expect(OPENAI_FULL_DOC_CONTEXT_BUDGET_TOKENS).toBeGreaterThan(100_000);
  });
});

describe("OPENAI_MAX_COMPLETION_TOKENS", () => {
  it("matches gpt-4o-mini completion limit (API rejects larger max_tokens)", () => {
    expect(OPENAI_MAX_COMPLETION_TOKENS).toBe(16_384);
  });
});
