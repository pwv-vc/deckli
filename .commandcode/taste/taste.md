# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# cli
See [cli/taste.md](cli/taste.md)

# llm
- Use the OpenAI SDK with API key loaded from `.env` via dotenv for LLM features; default to a small model like `gpt-4o-mini`. Confidence: 0.80
- When using OpenAI, output latency and token cost info from the response in debug mode. Confidence: 0.75
- Keep local LLM (ONNX) implementation alongside OpenAI; route based on model config key (e.g. `gpt-` prefix = OpenAI, else local). Confidence: 0.75

# output
- In the final CLI output summary, always show AI costs/token usage if an OpenAI model was used (local models show nothing). Confidence: 0.75
- Save all deck artifacts (PDF, markdown, images) together as a named zip archive. Confidence: 0.75
- In markdown cleanup prompts, instruct the model to output a detected slide title as `# Title` on the first line of each cleaned slide body; `reassembleMarkdown` should then promote it to `## Slide N: Title` in the assembled output. Confidence: 0.80
- Apply `normalizeMarkdownSpacing` to full-doc LLM output (which bypasses `reassembleMarkdown`): ensure blank lines before/after headings and collapse 3+ blank lines to 2. Confidence: 0.80
- The full-doc LLM cleanup path is the persistent source of broken markdown (missing blank lines between `## Slide N: Title` and content); if `normalizeMarkdownSpacing` post-processing alone doesn't fix it, the prompt itself must explicitly instruct the model to always output a blank line after every heading. Confidence: 0.85

# documentation
- Always keep the README updated with a project directory structure section showing where files live and what each directory is for, so the codebase is easy to navigate. Confidence: 0.90

# architecture
See [architecture/taste.md](architecture/taste.md)
