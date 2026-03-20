import OpenAI from "openai";
import { writeFileSync } from "fs";
import { join } from "path";
import { debugLog } from "./logger.js";
import { BUILT_IN_PLUGINS, DEFAULT_POST_PROCESS_STEPS } from "./plugins/index.js";
import type { PostProcessPlugin } from "./plugins/index.js";

export { BUILT_IN_PLUGINS, DEFAULT_POST_PROCESS_STEPS };
export type { PostProcessPlugin };

export interface PostProcessResult {
  pluginId: string;
  outputPath: string;
  success: boolean;
  estimatedCostUsd: number | null;
}

export interface PostProcessWorkflowOptions {
  debug?: boolean;
  onPluginStart?: (id: string, label: string) => void;
  onPluginDone?: (result: PostProcessResult) => void;
}

/** Returns the output file path for a given plugin, deck title, and deck directory. */
export function outputPathForPlugin(deckDir: string, deckTitle: string, plugin: PostProcessPlugin): string {
  return join(deckDir, `${deckTitle}.${plugin.outputSuffix}.${plugin.outputFormat}`);
}

function getOpenAiClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

/**
 * Run a sequence of post-processing plugins on cleaned markdown.
 * Each plugin calls OpenAI and writes its output to `<deckDir>/<deckTitle>.<suffix>.<format>`.
 * Returns results for all attempted plugins; skips unknown IDs with a debug warning.
 * If no OpenAI API key is set, returns an empty array.
 */
export async function runPostProcessWorkflow(
  cleanedMarkdown: string,
  deckTitle: string,
  deckDir: string,
  pluginIds: string[],
  modelId: string,
  options: PostProcessWorkflowOptions = {}
): Promise<PostProcessResult[]> {
  const { debug, onPluginStart, onPluginDone } = options;

  const client = getOpenAiClient();
  if (!client) {
    debugLog({ debug }, "OPENAI_API_KEY is not set; skipping post-processing workflow.");
    return [];
  }

  const results: PostProcessResult[] = [];

  for (const pluginId of pluginIds) {
    const plugin = BUILT_IN_PLUGINS[pluginId];
    if (!plugin) {
      debugLog({ debug }, `Post-processing: unknown plugin id "${pluginId}", skipping.`);
      continue;
    }

    const outputPath = outputPathForPlugin(deckDir, deckTitle, plugin);
    onPluginStart?.(plugin.id, plugin.label);
    debugLog({ debug }, `Post-processing: running plugin "${plugin.id}" → ${outputPath}`);

    const t0 = performance.now();
    try {
      const resp = await client.chat.completions.create({
        model: modelId,
        messages: [
          { role: "system", content: plugin.systemPrompt },
          { role: "user", content: cleanedMarkdown },
        ],
        temperature: 0,
        max_tokens: plugin.maxTokens,
      });

      const latencyMs = Math.round(performance.now() - t0);
      const u = resp.usage;
      const promptTokens = u?.prompt_tokens ?? 0;
      const completionTokens = u?.completion_tokens ?? 0;
      debugLog(
        { debug },
        `Post-processing plugin "${plugin.id}" | model=${modelId} | latency=${latencyMs}ms | prompt_tokens=${promptTokens} | completion_tokens=${completionTokens}`
      );

      const content = resp.choices[0]?.message?.content?.trim() ?? "";
      writeFileSync(outputPath, content, "utf-8");

      const estimatedCostUsd = estimateOpenAiCostUsd(modelId, promptTokens, completionTokens);
      const result: PostProcessResult = { pluginId: plugin.id, outputPath, success: true, estimatedCostUsd };
      results.push(result);
      onPluginDone?.(result);
    } catch (err) {
      const latencyMs = Math.round(performance.now() - t0);
      debugLog(
        { debug },
        `Post-processing plugin "${plugin.id}" failed after ${latencyMs}ms: ${err instanceof Error ? err.message : String(err)}`
      );
      const result: PostProcessResult = { pluginId: plugin.id, outputPath, success: false, estimatedCostUsd: null };
      results.push(result);
      onPluginDone?.(result);
    }
  }

  return results;
}

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
