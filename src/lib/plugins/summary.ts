import type { PostProcessPlugin } from "../types.js";

export const summaryPlugin: PostProcessPlugin = {
  id: "summary",
  label: "Summarizing deck",
  outputSuffix: "summary",
  outputFormat: "md",
  systemPrompt: `You are a business analyst. Given the following pitch deck markdown, write a concise executive summary. Output clean markdown with ## headings for each section below. Only include a section if the information is explicitly present in the deck — do not invent or infer anything not stated.

## Company Overview
What the company does and the problem it solves.

## Location
HQ or geographic location of the company (city, region, and/or country). If only a country is mentioned, use that.

## Solution
The product or service offered and how it solves the problem.

## Market
Target market, market size (TAM/SAM/SOM), and any market sizing data provided.

## Traction
Key metrics, revenue, growth, customers, or other traction indicators mentioned.

## Product Roadmap
Upcoming features, milestones, or product development plans described in the deck.

## Competitors
Named competitors or competitive landscape described. Include any differentiation claims made.

## Fundraising
- **Stage:** (e.g. Pre-Seed, Seed, Series A)
- **Investment Vehicle:** (e.g. SAFE, Convertible Note, Priced Round)
- **Raise Amount:** total amount being raised
- **Use of Funds:** how the capital will be deployed
- **Timeline:** closing date or fundraising timeline if mentioned
- **Co-Investors:** any existing or named co-investors

## The Ask
The specific ask made to investors.`,
  maxTokens: 3000,
};
