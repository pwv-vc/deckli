# deckli

Download DocSend decks as PDF — one command, full quality.

A TypeScript CLI that saves any public (or logged-in) DocSend deck as a single PDF or as individual PNG images. Code based on [captivus/docsend-dl](https://github.com/captivus/docsend-dl); thanks to that project.

## Quick start

```bash
pnpm install
pnpm exec playwright install chromium
pnpm build
./dist/cli.js https://docsend.com/view/XXXXXX
```

Or with pnpm run:

```bash
pnpm dev https://docsend.com/view/XXXXXX
```

## Installation

- **Node**: 18+
- **Package manager**: pnpm

```bash
pnpm install
pnpm exec playwright install chromium
pnpm build
```

Link globally (check for name conflicts first):

```bash
pnpm link --global
deckli https://docsend.com/view/XXXXXX
```

## Usage

### Download as PDF (default)

```bash
deckli https://docsend.com/view/XXXXXX
deckli https://dbx.docsend.com/view/XXXXXX
```

Output: `{deck-title}.pdf` in the current directory.

### Markdown (OCR + cleanup) — on by default

By default, the CLI runs **OCR markdown** and **model cleanup** alongside the PDF (same base name as the PDF):

```bash
deckli https://docsend.com/view/XXXXXX
```

This runs OCR (tesseract.js) on each slide and writes **`{name}.raw.md`**, then cleans it to **`{name}.cleaned.md`** using the model in `~/.deckli/config.json` (`markdownCleanupModel`). **Default model is `gpt-4o-mini` via the OpenAI API** — set **`OPENAI_API_KEY`** (see [OpenAI API key](#openai-api-key-environment-variable)). For fully local cleanup without API keys, set `markdownCleanupModel` to `"350m"` or `"1.2b"` (Liquid Nano Extract ONNX; first run downloads the model).

**Opt out:**

- **`--no-markdown`** — PDF (or `--images`) only; no `.md` files.
- **`--no-cleanup`** — Keep **`{name}.raw.md`** only; skip cleaned markdown (faster, no API / local model for cleanup).

The first `#` heading is updated from the DocSend slug to a **readable deck title** when a friendly filename is detected (e.g. `# RenewablesBridge` instead of `# docsend-…`).

### Title detection

PDF and markdown filenames are not always the DocSend URL slug. When slides are available, the tool **detects a friendly name** from the first slide:

1. OCR is run on the first slide image.
2. The same model as `--cleanup` (OpenAI or local Extract) is asked to extract company and/or product name and return a short filename ending with `-deck` (e.g. `AcmeCorp-ProductName-deck`).
3. The result is sanitized for filenames (letters, numbers, hyphens only) and used as the base name for the PDF and markdown files (`.raw.md`, `.cleaned.md`).

If detection fails (no slides, empty OCR, or model error), the DocSend deck slug is used as before.

### Options

- **`-o, --output <path>`** — Output path: a `.pdf` filename, or a directory (then the file is `{deck-title}.pdf` inside it). For `--images`, this is the output directory.
- **`--images`** — Save individual PNG images instead of a single PDF.
- **`-m, --markdown`** — Create OCR markdown (default: **on**). Use with **`--no-markdown`** to disable.
- **`--no-markdown`** — Skip OCR markdown; PDF/images only.
- **`--cleanup`** — Clean raw markdown with OpenAI or a local Extract model (default: **on**). Writes `{name}.cleaned.md`.
- **`--no-cleanup`** — Skip cleanup; keep raw OCR only.
- **`--force`** — Re-download slide images even if they are already present (output dir for `--images`, or cache for PDF). Without `--force`, existing images are reused and the tool only re-runs PDF assembly and/or markdown/cleanup/rename as requested.
- **`--no-headless`** — Show the browser window during extraction (useful for debugging or one-off login).
- **`--json`** — Output machine-readable JSON (no banner, no progress text; result only).

### Login (for private or email-gated decks)

Login is **per deck**: each DocSend URL has its own saved session, so you can use different accounts for different decks.

1. Run login with the deck URL you want to access:

   ```bash
   deckli login https://docsend.com/view/private-deck-id
   ```

2. Log in with the account that can access that deck, then press Enter in the terminal.

3. Download that deck (uses the session you just saved):

   ```bash
   deckli https://docsend.com/view/private-deck-id
   ```

To use a different email for another deck, run `deckli login <other-url>` and log in with the other account; sessions are stored separately per deck.

### Logout

Clear saved login for one deck or all:

```bash
deckli logout https://docsend.com/view/xxxxx   # clear this deck's login
deckli logout                                 # clear all saved logins
```

### Commands

- **`deckli [url]`** — Download deck at URL (default).
- **`deckli download [url]`** — Same, with explicit command.
- **`deckli login <url>`** — Open browser to log in for this deck; session stored per deck under `~/.deckli/profiles/`.
- **`deckli logout [url]`** — Clear saved login for the given deck, or all decks if no URL.
- **`-v, --version`** — Print version only.
- **`-h, --help`** — Show help.

## How it works

1. Opens the DocSend page in Chromium (Playwright), using that deck's saved login if you ran `deckli login <url>` for it.
2. Extracts each slide’s image URL from the page’s `page_data` endpoints.
3. Downloads all slide images in parallel with retries.
4. If slide images are already present (output directory for `--images`, or `~/.deckli/cache/<slug>/` for PDF), skips downloading unless `--force` is used; then assembles PDF and/or runs markdown/cleanup/rename as requested.
5. Writes the PDF and (unless `--no-markdown`) `{name}.raw.md` first under the DocSend slug so you get files quickly.
6. Detects a friendly name (first-slide text + configured model) and (unless `--no-cleanup`) cleans markdown, then renames the PDF and markdown files (`.raw.md`, `.cleaned.md`) to the friendly name when it differs from the slug.
7. Prints a **summary** framed by dim horizontal rules (no side borders), with **short path labels** (relative to the current directory, `~/…`, or filenames). Paths are **OSC 8 hyperlinks** (`file://`) in terminals that support them (VS Code, iTerm2, Ghostty, etc.) — click to open in Finder or your default app.

## Config

Config and browser profile are stored in `~/.deckli/`:

- `config.json` — e.g. `headless`, `concurrency`, `maxRetries`, `useStoredLogin`, `markdownCleanupModel`, `markdownContextLimitTokens`, `markdownCleanupFullDoc`. Model choice lives here; **the OpenAI API key does not** — use the **`OPENAI_API_KEY` environment variable** ([below](#openai-api-key-environment-variable)).
- **`markdownCleanupModel`** — Which model to use for title detection and markdown cleanup. **Default: `"gpt-4o-mini"`** (OpenAI; requires `OPENAI_API_KEY` in the environment). For local ONNX only, use `"350m"` or `"1.2b"`. Any model id starting with `gpt-` uses the OpenAI API. Stored in `config.json`.
- **`markdownContextLimitTokens`** — Model context window in tokens (default 32000). Used when full-doc cleanup is enabled.
- **`markdownCleanupFullDoc`** — For **local** models (`350m` / `1.2b`) only: when `true`, cleanup may run on the full document in one call when within `markdownContextLimitTokens` (faster but can trigger structured/XML output from Extract models). When `false` (default), cleanup runs slide-by-slide. **OpenAI** models use one full-deck request whenever the deck fits the internal ~120k-token budget, regardless of this flag.
- `profiles/<key>/` — One browser profile per deck (key = slug or `v-SPACE-NAME`). Used when you run `deckli login <url>` for that deck.

### OpenAI API key (environment variable)

OpenAI models read the secret from the **`OPENAI_API_KEY`** environment variable only — it is **not** stored in `~/.deckli/config.json` (so the key is not mixed with normal preferences or committed by mistake).

The CLI loads [dotenv](https://github.com/motdotla/dotenv) at startup, so if a **`.env`** file exists in the **current working directory** when you run `deckli`, variables from it are applied (e.g. `OPENAI_API_KEY=sk-...`). You can also:

- **Export in the shell** (session or add to `~/.zshrc` / `~/.bashrc`):  
  `export OPENAI_API_KEY=sk-...`
- **Set in your IDE / terminal profile** for integrated runs
- **Set in CI or deployment** environment config (GitHub Actions secrets, etc.)

See also [`.env.example`](.env.example) in the repo.

### OpenAI (default)

Title detection and `--cleanup` default to **`gpt-4o-mini`** via the [OpenAI API](https://platform.openai.com/docs).

If `OPENAI_API_KEY` is missing while an OpenAI model is selected, cleanup and title detection fall back to raw OCR text and the DocSend slug (with a warning).

With **`--debug`**, each OpenAI call logs to stderr: **latency** (ms), **token usage** from the API (`prompt_tokens`, `completion_tokens`, `total_tokens`), and an **approximate USD cost** (rough rates for common models; not billing-authoritative). Slide-by-slide cleanup also prints a **sum** line after all slides.

OpenAI cleanup uses **one full-deck request** when the estimated prompt + output fits a ~120k-token budget (typical decks). Only very large OCR output falls back to slide-by-slide. This ignores `markdownCleanupFullDoc`, which applies to **local** ONNX models only.

### Local ONNX / Liquid AI models

Set `markdownCleanupModel` to **`350m`** or **`1.2b`** to use **Liquid AI LFM2 Extract** (ONNX, via [Transformers.js](https://huggingface.co/docs/transformers.js)), from the [Liquid Nanos](https://huggingface.co/collections/LiquidAI/liquid-nanos) collection. These checkpoints are tuned for structured extraction; if you see XML or angle-bracket output, prefer **slide-by-slide** (default: `markdownCleanupFullDoc: false`) and/or **`1.2b`**.

| Option   | Model (Hugging Face)                         | Notes              |
|----------|------------------------------------------------|--------------------|
| `350m`   | `onnx-community/LFM2-350M-Extract-ONNX`       | Smaller, faster |
| `1.2b`   | `onnx-community/LFM2-1.2B-Extract-ONNX`      | Larger; higher quality   |

Models are downloaded on first use and cached. See [Liquid AI docs](https://docs.liquid.ai/docs/models/lfm2-350m-extract) and the [onnx-community](https://huggingface.co/onnx-community) space for details.

## Limitations

- Only public decks are supported without login; for email-gated or private decks, use `deckli login <url>` for that deck first (or `--no-headless` to log in manually in a one-off run).
- Requires Chromium installed via `playwright install chromium`.
- OCR markdown (on by default; use **`--no-markdown`** to skip) can be slow on large decks; text quality depends on slide image clarity.
- With **local** models (`350m` / `1.2b`), cleanup downloads an ONNX model on first use (hundreds of MB) and runs locally. With **OpenAI** (default), cleanup requires network access and a valid API key. Use **`--no-cleanup`** to skip. Cleanup runs slide-by-slide by default for local models. If local cleanup seems to stall, run with **`--debug`** to see progress.

## Development

```bash
pnpm install
pnpm dev -- <args>    # Run with tsx
pnpm build            # Build with tsup
pnpm test             # Run vitest
```

**CLI icons** — Status symbols for ora spinners and the download summary are defined in `src/config/cli-icons.ts`: raw glyphs in `CLI_ICONS`, semantic ANSI colors in `CLI_ICONS_COLOR` (picocolors). Edit that file to swap characters or colors app-wide (glyphs use the [`figures`](https://github.com/sindresorhus/figures) package).

## License

MIT
