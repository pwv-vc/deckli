import { writeFileSync } from "fs";
import { join } from "path";
import { debugLog } from "../logger.js";
import { extractCompanyWebsiteUrl } from "./plugin-utils.js";
import type { ActionPlugin, ActionPluginRunOptions, PostProcessResult } from "../types.js";

async function fetchFavicon(
  websiteUrl: string,
  debug?: boolean
): Promise<{ buffer: Buffer; ext: string } | null> {
  // Strategy 1: try /favicon.ico directly
  try {
    const faviconUrl = new URL("/favicon.ico", websiteUrl).href;
    const resp = await fetch(faviconUrl, { signal: AbortSignal.timeout(10_000) });
    if (resp.ok) {
      const ct = resp.headers.get("content-type") ?? "";
      const ext = ct.includes("png") ? "png" : "ico";
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > 100) {
        debugLog({ debug }, `favicon: found at ${faviconUrl} (${buf.length} bytes, ${ext})`);
        return { buffer: buf, ext };
      }
    }
  } catch (err) {
    debugLog({ debug }, `favicon: /favicon.ico fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Strategy 2: parse HTML <link rel="icon"> or <link rel="shortcut icon">
  try {
    const htmlResp = await fetch(websiteUrl, { signal: AbortSignal.timeout(10_000) });
    if (!htmlResp.ok) return null;
    const html = await htmlResp.text();

    const iconMatch =
      html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i) ??
      html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i);

    if (!iconMatch?.[1]) return null;

    const iconUrl = new URL(iconMatch[1], websiteUrl).href;
    debugLog({ debug }, `favicon: found <link rel="icon"> → ${iconUrl}`);

    const iconResp = await fetch(iconUrl, { signal: AbortSignal.timeout(10_000) });
    if (!iconResp.ok) return null;

    const ct = iconResp.headers.get("content-type") ?? "";
    const ext = ct.includes("png") ? "png" : ct.includes("svg") ? "svg" : "ico";
    const buf = Buffer.from(await iconResp.arrayBuffer());
    return buf.length > 0 ? { buffer: buf, ext } : null;
  } catch (err) {
    debugLog({ debug }, `favicon: HTML parse strategy failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export const faviconPlugin: ActionPlugin = {
  id: "favicon",
  label: "Fetching favicon",
  outputSuffix: "favicon",

  async run(
    markdown: string,
    outputDir: string,
    title: string,
    options: ActionPluginRunOptions
  ): Promise<PostProcessResult> {
    const modelId = options.modelId ?? "gpt-4o-mini";
    const fallbackPath = join(outputDir, `${title}.favicon.ico`);

    const websiteUrl = await extractCompanyWebsiteUrl(markdown, modelId, { debug: options.debug });
    if (!websiteUrl) {
      debugLog({ debug: options.debug }, "favicon: no company website URL found in markdown");
      return { pluginId: "favicon", outputPath: fallbackPath, success: false, estimatedCostUsd: null };
    }

    debugLog({ debug: options.debug }, `favicon: fetching from ${websiteUrl}`);
    const result = await fetchFavicon(websiteUrl, options.debug);
    if (!result) {
      debugLog({ debug: options.debug }, `favicon: could not retrieve favicon from ${websiteUrl}`);
      return { pluginId: "favicon", outputPath: fallbackPath, success: false, estimatedCostUsd: null };
    }

    const outputPath = join(outputDir, `${title}.favicon.${result.ext}`);
    writeFileSync(outputPath, result.buffer);
    debugLog({ debug: options.debug }, `favicon: saved to ${outputPath}`);
    return { pluginId: "favicon", outputPath, success: true, estimatedCostUsd: null };
  },
};
