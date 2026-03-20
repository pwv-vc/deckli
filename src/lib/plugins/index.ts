import type { PostProcessPlugin, ActionPlugin } from "../types.js";
import { summaryPlugin } from "./summary.js";
import { teamPlugin } from "./team.js";
import { linksPlugin } from "./links.js";
import { whatifPlugin } from "./whatif.js";
import { faviconPlugin } from "./favicon.js";
import { screenshotPlugin } from "./screenshot.js";

export type { PostProcessPlugin, ActionPlugin };

/**
 * Registry of all available post-processing plugins.
 * To add a new plugin: create a file in this directory, import it here, and add it to this object.
 */
export const BUILT_IN_PLUGINS: Record<string, PostProcessPlugin | ActionPlugin> = {
  summary: summaryPlugin,
  team: teamPlugin,
  links: linksPlugin,
  whatif: whatifPlugin,
  favicon: faviconPlugin,
  screenshot: screenshotPlugin,
};

/** Default ordered list of plugin IDs run when no `postProcessSteps` config is set. */
export const DEFAULT_POST_PROCESS_STEPS: string[] = Object.keys(BUILT_IN_PLUGINS);
