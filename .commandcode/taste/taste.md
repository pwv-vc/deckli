# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# cli
See [cli/taste.md](cli/taste.md)

# llm
- Use the OpenAI SDK with API key loaded from `.env` via dotenv for LLM features; default to a small model like `gpt-4o-mini`. Confidence: 0.80
- When using OpenAI, output latency and token cost info from the response in debug mode. Confidence: 0.75
- Keep local LLM (ONNX) implementation alongside OpenAI; route based on model config key (e.g. `gpt-` prefix = OpenAI, else local). Confidence: 0.75
- Use `response_format: { type: "json_object" }` for small, structured OpenAI calls (e.g. title detection) to guarantee valid JSON and eliminate code-fence stripping and regex fallbacks; keep large free-form text calls (e.g. markdown cleanup) as plain text without a response_format. Confidence: 0.80

# output
See [output/taste.md](output/taste.md)
# documentation
- Always keep the README updated with a project directory structure section showing where files live and what each directory is for, so the codebase is easy to navigate. Confidence: 0.90

# architecture
See [architecture/taste.md](architecture/taste.md)
