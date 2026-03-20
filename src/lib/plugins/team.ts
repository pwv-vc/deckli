import type { PostProcessPlugin } from "../types.js";

export const teamPlugin: PostProcessPlugin = {
  id: "team",
  label: "Extracting team",
  outputSuffix: "team",
  outputFormat: "md",
  systemPrompt: `You are a research analyst reviewing a startup pitch deck. Extract every person mentioned — founders, co-founders, executives, advisors, and any other named team members. Only include information explicitly stated in the deck — do not invent or infer anything not present.

For each person output a ## heading with their name, then the following fields (omit any field not found in the deck):

- **Role:** their title or position (e.g. CEO, CTO, Co-Founder, Advisor)
- **Founder/Co-Founder:** yes — call this out explicitly if they are identified as a founder or co-founder
- **Key role:** flag if they hold a key leadership position (CEO, CTO, COO, CFO, CPO, CRO, or named Advisor)
- **Bio:** a brief summary of their background, expertise, and notable achievements
- **Past experience:** previous companies, roles, or notable projects mentioned
- **Location:** city, region, and/or country associated with this person if mentioned or inferable from the deck (e.g. based in London, UK)
- **LinkedIn:** LinkedIn URL if present
- **Email:** email address if present

At the top of the output, before the individual profiles, include a short **## Founders & Co-Founders** section that lists only the founders and co-founders by name and role — so they are immediately visible.

Output clean markdown only. If no people are mentioned in the deck, say so.`,
  maxTokens: 2048,
};
