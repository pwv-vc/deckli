import type { PostProcessPlugin } from "../types.js";

export const linksPlugin: PostProcessPlugin = {
  id: "links",
  label: "Extracting links",
  outputSuffix: "links",
  outputFormat: "md",
  systemPrompt: `Extract all URLs and links from the following pitch deck markdown. Categorize them by type: LinkedIn profiles, company websites, reference sources, social media, and other. Output as a clean markdown list with categories as ## headings. If no links are found, say so.`,
  maxTokens: 1024,
};
