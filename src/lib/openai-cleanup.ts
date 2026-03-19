import OpenAI from "openai";
import type { CleanupMarkdownOptions, DeriveFriendlyDeckNameOptions } from "./markdown-cleanup.js";
import {
  estimateTokens,
  extractMarkdownFromStructured,
  FULL_DOC_SYSTEM_PROMPT,
  looksLikeStructuredOutput,
  NAME_DECK_SYSTEM_PROMPT,
  parseTitleFromJson,
  reassembleMarkdown,
  sanitizeFriendlyDeckName,
  splitMarkdownIntoSlides,
  SYSTEM_PROMPT,
  isPromptLeak,
} from "./markdown-cleanup.js";

/** True when the configured model id should use the OpenAI API (e.g. gpt-4o-mini). */
export function isOpenAiModelKey(key: string): boolean {
  return key.startsWith("gpt-");
}

function getOpenAiClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

/** Approximate USD per 1M tokens (input / output); update when pricing changes. */
function estimateOpenAiCostUsd(model: string, promptTokens: number, completionTokens: number): number | null {
  const m = model.toLowerCase();
  let inputPerM = 0.15;
  let outputPerM = 0.6;
  if (m.includes("gpt-4o-mini")) {
    inputPerM = 0.15;
    outputPerM = 0.6;
  } else if (m.includes("gpt-4o") && !m.includes("mini")) {
    inputPerM = 2.5;
    outputPerM = 10;
  } else if (m.includes("gpt-4-turbo") || m.includes("gpt-4-0125") || m.includes("gpt-4-1106")) {
    inputPerM = 10;
    outputPerM = 30;
  } else if (m.startsWith("gpt-3.5")) {
    inputPerM = 0.5;
    outputPerM = 1.5;
  } else if (!m.startsWith("gpt-")) {
    return null;
  }
  return (promptTokens / 1e6) * inputPerM + (completionTokens / 1e6) * outputPerM;
}

export interface OpenAiCompletionMetrics {
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number | null;
}

interface ChatCompletionResult {
  content: string;
  metrics: OpenAiCompletionMetrics;
}

async function chatCompletion(
  client: OpenAI,
  model: string,
  system: string,
  user: string,
  maxTokens: number
): Promise<ChatCompletionResult> {
  const t0 = performance.now();
  const resp = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0,
    max_tokens: maxTokens,
  });
  const latencyMs = Math.round(performance.now() - t0);
  const u = resp.usage;
  const promptTokens = u?.prompt_tokens;
  const completionTokens = u?.completion_tokens;
  const totalTokens = u?.total_tokens;
  const estimatedCostUsd =
    promptTokens != null && completionTokens != null
      ? estimateOpenAiCostUsd(model, promptTokens, completionTokens)
      : null;
  const content = resp.choices[0]?.message?.content?.trim() ?? "";
  return {
    content,
    metrics: {
      latencyMs,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd,
    },
  };
}

function logOpenAiDebug(
  label: string,
  model: string,
  metrics: OpenAiCompletionMetrics,
  debug?: boolean
): void {
  if (!debug) return;
  const parts: string[] = [
    `[deckli] OpenAI ${label}`,
    `model=${model}`,
    `latency=${metrics.latencyMs}ms`,
  ];
  if (metrics.promptTokens != null) parts.push(`prompt_tokens=${metrics.promptTokens}`);
  if (metrics.completionTokens != null) parts.push(`completion_tokens=${metrics.completionTokens}`);
  if (metrics.totalTokens != null) parts.push(`total_tokens=${metrics.totalTokens}`);
  if (metrics.estimatedCostUsd != null) parts.push(`~$${metrics.estimatedCostUsd.toFixed(6)}`);
  else if (metrics.promptTokens != null && metrics.completionTokens != null) {
    parts.push("cost=n/a (unknown model pricing)");
  }
  console.warn(parts.join(" | "));
}

/**
 * Rough token budget for one-shot full-deck cleanup (gpt-4o-mini etc. have 128k context; leave headroom).
 * Unlike local ONNX, we prefer a single request when input+estimated output fits here.
 */
export const OPENAI_FULL_DOC_CONTEXT_BUDGET_TOKENS = 120_000;

/**
 * Cap for Chat Completions `max_tokens` (completion), not context window size.
 * gpt-4o-mini allows at most 16,384 completion tokens; larger values return HTTP 400.
 */
export const OPENAI_MAX_COMPLETION_TOKENS = 16_384;

/**
 * Clean OCR markdown using OpenAI Chat Completions (same prompts as local Extract).
 * When the deck fits {@link OPENAI_FULL_DOC_CONTEXT_BUDGET_TOKENS}, uses **one** full-document request
 * (ignores `markdownCleanupFullDoc` / slide-by-slide). Otherwise falls back to slide-by-slide.
 */
export async function cleanupMarkdownWithOpenAi(
  rawMarkdown: string,
  modelId: string,
  options: CleanupMarkdownOptions = {}
): Promise<string> {
  const { onProgress, debug } = options;
  const client = getOpenAiClient();
  if (!client) {
    console.warn(
      "[deckli] OPENAI_API_KEY is not set; skipping markdown cleanup. Set it in .env or the environment to use OpenAI models."
    );
    return rawMarkdown;
  }

  const parsed = splitMarkdownIntoSlides(rawMarkdown);
  if (parsed.slides.length === 0) return rawMarkdown;

  const inputTokens = estimateTokens(FULL_DOC_SYSTEM_PROMPT + rawMarkdown);
  const outputReserve = Math.ceil(estimateTokens(rawMarkdown) * 1.2);
  const useFullDoc = inputTokens + outputReserve <= OPENAI_FULL_DOC_CONTEXT_BUDGET_TOKENS;

  if (useFullDoc) {
    const maxTokens = Math.min(
      OPENAI_MAX_COMPLETION_TOKENS,
      Math.max(4096, OPENAI_FULL_DOC_CONTEXT_BUDGET_TOKENS - inputTokens)
    );
    if (debug) {
      console.warn(
        `[deckli] OpenAI full-doc cleanup (single request): estimated_input~${inputTokens} tokens, max_output_tokens=${maxTokens}`
      );
    }
    onProgress?.(1, 1);
    try {
      const { content: cleaned, metrics } = await chatCompletion(
        client,
        modelId,
        FULL_DOC_SYSTEM_PROMPT,
        rawMarkdown,
        maxTokens
      );
      logOpenAiDebug("cleanup (full-doc)", modelId, metrics, debug);
      if (cleaned && !looksLikeStructuredOutput(cleaned)) return cleaned;
      const fromStruct = extractMarkdownFromStructured(cleaned);
      if (fromStruct) return fromStruct;
      return rawMarkdown;
    } catch (err) {
      console.warn(
        "[deckli] OpenAI cleanup failed:",
        err instanceof Error ? err.message : String(err)
      );
      return rawMarkdown;
    }
  }

  if (debug) {
    console.warn(
      `[deckli] OpenAI: using slide-by-slide (estimated input+reserve ~${inputTokens + outputReserve} tokens exceeds ${OPENAI_FULL_DOC_CONTEXT_BUDGET_TOKENS} budget)`
    );
  }

  const total = parsed.slides.length;
  const sortedSlides = [...parsed.slides].sort((a, b) => a.index - b.index);
  const cleanedBodies: string[] = [];
  let sumLatency = 0;
  let sumPrompt = 0;
  let sumCompletion = 0;
  let sumTotal = 0;
  let sumCost = 0;
  let costCalls = 0;

  for (let i = 0; i < sortedSlides.length; i++) {
    onProgress?.(i + 1, total);
    const slide = sortedSlides[i];
    try {
      const { content: cleaned, metrics } = await chatCompletion(client, modelId, SYSTEM_PROMPT, slide.body, 4096);
      logOpenAiDebug(`cleanup slide ${i + 1}/${total}`, modelId, metrics, debug);
      sumLatency += metrics.latencyMs;
      if (metrics.promptTokens != null) sumPrompt += metrics.promptTokens;
      if (metrics.completionTokens != null) sumCompletion += metrics.completionTokens;
      if (metrics.totalTokens != null) sumTotal += metrics.totalTokens;
      if (metrics.estimatedCostUsd != null) {
        sumCost += metrics.estimatedCostUsd;
        costCalls += 1;
      }
      if (cleaned && !looksLikeStructuredOutput(cleaned)) {
        cleanedBodies.push(cleaned);
      } else {
        const fromStruct = cleaned ? extractMarkdownFromStructured(cleaned) : null;
        cleanedBodies.push(fromStruct || slide.body);
      }
    } catch {
      cleanedBodies.push(slide.body);
    }
  }

  if (debug && total > 0) {
    const parts = [
      `[deckli] OpenAI cleanup (all slides)`,
      `model=${modelId}`,
      `calls=${total}`,
      `latency_sum=${sumLatency}ms`,
      `prompt_tokens_sum=${sumPrompt}`,
      `completion_tokens_sum=${sumCompletion}`,
      `total_tokens_sum=${sumTotal}`,
    ];
    if (costCalls > 0) parts.push(`~$${sumCost.toFixed(6)} (estimated sum)`);
    console.warn(parts.join(" | "));
  }

  return reassembleMarkdown(parsed, cleanedBodies);
}

/**
 * Derive a friendly deck filename using OpenAI (same JSON schema as local model).
 */
export async function deriveFriendlyDeckNameWithOpenAi(
  firstSlideOcrText: string,
  fallback: string,
  modelId: string,
  options: DeriveFriendlyDeckNameOptions = {}
): Promise<string> {
  const { maxInputTokens = 500, debug } = options;
  const client = getOpenAiClient();
  if (!client) {
    if (debug) console.warn("[deckli] OPENAI_API_KEY missing; using fallback deck name.");
    return fallback;
  }

  const maxChars = maxInputTokens * 4;
  const text = firstSlideOcrText.trim().slice(0, maxChars);
  if (!text) return fallback;

  try {
    const { content: raw, metrics } = await chatCompletion(client, modelId, NAME_DECK_SYSTEM_PROMPT, text, 128);
    logOpenAiDebug("title detection", modelId, metrics, debug);
    const fromJson = parseTitleFromJson(raw);
    const rawTitle = fromJson ?? raw;
    if (isPromptLeak(rawTitle)) return fallback;
    const friendly = sanitizeFriendlyDeckName(rawTitle);
    if (isPromptLeak(friendly)) return fallback;
    return friendly || fallback;
  } catch (err) {
    if (debug) {
      console.warn(
        "[deckli] OpenAI title detection failed:",
        err instanceof Error ? err.message : String(err)
      );
    }
    return fallback;
  }
}
