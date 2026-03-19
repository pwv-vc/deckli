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

# documentation
- Always keep the README updated with a project directory structure section showing where files live and what each directory is for, so the codebase is easy to navigate. Confidence: 0.90

# architecture
See [architecture/taste.md](architecture/taste.md)
