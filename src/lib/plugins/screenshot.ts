import { join } from "path";
import { chromium } from "playwright";
import { debugLog } from "../logger.js";
import { extractCompanyWebsiteUrl } from "./plugin-utils.js";
import type { ActionPlugin, ActionPluginRunOptions, PostProcessResult } from "../types.js";

export const screenshotPlugin: ActionPlugin = {
  id: "screenshot",
  label: "Taking website screenshot",
  outputSuffix: "screenshot",

  async run(
    markdown: string,
    outputDir: string,
    title: string,
    options: ActionPluginRunOptions
  ): Promise<PostProcessResult> {
    const modelId = options.modelId ?? "gpt-4o-mini";
    const outputPath = join(outputDir, `${title}.screenshot.png`);

    const websiteUrl = await extractCompanyWebsiteUrl(markdown, modelId, { debug: options.debug });
    if (!websiteUrl) {
      debugLog({ debug: options.debug }, "screenshot: no company website URL found in markdown");
      return { pluginId: "screenshot", outputPath, success: false, estimatedCostUsd: null };
    }

    debugLog({ debug: options.debug }, `screenshot: navigating to ${websiteUrl}`);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(websiteUrl, { waitUntil: "networkidle", timeout: 30_000 });
      await page.screenshot({ path: outputPath, fullPage: true });
      debugLog({ debug: options.debug }, `screenshot: saved to ${outputPath}`);
      return { pluginId: "screenshot", outputPath, success: true, estimatedCostUsd: null };
    } finally {
      await browser.close();
    }
  },
};
