# output
- In the final CLI output summary, always show AI costs/token usage if an OpenAI model was used (local models show nothing). Confidence: 0.75
- Save all deck artifacts (PDF, markdown, images) together as a named zip archive. Confidence: 0.75
- In markdown cleanup prompts, instruct the model to output a detected slide title as `# Title` on the first line of each cleaned slide body; `reassembleMarkdown` should then promote it to `## Slide N: Title` in the assembled output. Confidence: 0.80
- Apply `normalizeMarkdownSpacing` to full-doc LLM output (which bypasses `reassembleMarkdown`): ensure blank lines before/after headings and collapse 3+ blank lines to 2. Confidence: 0.80
- The full-doc LLM cleanup path is the persistent source of broken markdown (missing blank lines between `## Slide N: Title` and content); if `normalizeMarkdownSpacing` post-processing alone doesn't fix it, the prompt itself must explicitly instruct the model to always output a blank line after every heading. Confidence: 0.85
- LLM models may output literal `\n` escape sequences (backslash-n) instead of real newlines; always unescape `\\n` → `\n` (and `\\t` → `\t`) at the start of `normalizeMarkdownSpacing` and in the `extractMarkdownFromStructured` regex fallback to prevent single-line output files. Confidence: 0.90
