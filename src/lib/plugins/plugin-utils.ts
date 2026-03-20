import OpenAI from "openai";
import { debugLog } from "../logger.js";

/**
 * Uses a small OpenAI call (json_object format) to extract the company's primary website URL
 * from cleaned deck markdown. Returns null if no URL is found or if OpenAI is unavailable.
 */
export async function extractCompanyWebsiteUrl(
  markdown: string,
  modelId: string,
  options: { debug?: boolean } = {}
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  const client = new OpenAI({ apiKey: key });
  try {
    const resp = await client.chat.completions.create({
      model: modelId,
      messages: [
        {
          role: "system",
          content:
            'Extract the company\'s primary website URL from the pitch deck content. Return JSON with a single field "url" containing the full URL (including https://), or null if no website URL is found. Only return the main company website — not LinkedIn, GitHub, DocSend, or other third-party URLs.',
        },
        { role: "user", content: markdown.slice(0, 8_000) },
      ],
      temperature: 0,
      max_tokens: 100,
      response_format: { type: "json_object" },
    });
    const content = resp.choices[0]?.message?.content ?? "";
    debugLog({ debug: options.debug }, `extractCompanyWebsiteUrl response: ${content}`);
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return typeof parsed.url === "string" ? parsed.url : null;
  } catch (err) {
    debugLog(
      { debug: options.debug },
      `extractCompanyWebsiteUrl failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}
