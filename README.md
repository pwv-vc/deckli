# deckrd

<img width="1376" height="768" alt="deckrd" src="https://github.com/user-attachments/assets/5a8723d9-3d78-4095-82b0-4a2f50f81b65" />


> Named after Deckard, the protagonist from Ridley Scott's *Blade Runner* (1982) — a replicant hunter who sees past illusions to uncover truth, much like this tool extracts decks from black boxes.
>
> _"All those moments will be lost in time, like tears in rain."_ — Don't let your decks disappear. Extract them.

**They shared a link. You wanted the content. Decks shouldn't be black boxes.**

A TypeScript CLI that downloads presentation decks and extracts searchable text from slides. Default output includes an assembled PDF, OCR markdown with AI cleanup, AI post-processing analysis, slide images, and a complete bundle. Currently supports **DocSend** (default); built with a plugin architecture so additional sources (Google Slides, PitchDeck, Brieflink, etc.) can be added without touching the output pipeline. Inspired by [captivus/docsend-dl](https://github.com/captivus/docsend-dl); thanks to that project.

## The Problem

> _Stop screenshotting slides. Get the text, the PDF, the whole thing._
> _Decks shouldn't be black boxes. Extract everything._

DocSend decks are great for sharing presentations, but they're locked in a viewer. Getting the actual content — especially the text — is tedious:

- **No native export**: DocSend doesn't provide a download button for most decks
- **Text is trapped**: Slides are images, so you can't search, copy, or analyze the content
- **Manual work**: Screenshotting slides and transcribing text is slow and error-prone
- **No bulk access**: Fetching multiple decks or organizing them systematically is difficult

**deckrd solves this** by automating the entire workflow: fetching slides, extracting text via OCR, cleaning it with AI models, running post-processing analysis, and organizing everything into a structured bundle. You get both the visual slides (PDF/PNG) and the extracted text (markdown) ready for search, analysis, or AI processing.

## Quickstart

```bash
pnpm install
pnpm exec playwright install chromium
pnpm build
./dist/cli.js https://docsend.com/view/XXXXXX
# optional: parent directory for all decks
./dist/cli.js -o ./exports https://docsend.com/view/XXXXXX
```

Or with pnpm run:

```bash
pnpm dev https://docsend.com/view/XXXXXX
pnpm dev -- -o ./exports https://docsend.com/view/XXXXXX
```

## Features

- **PDF by default** — slides are assembled into a single PDF at full resolution
- **Text extraction** — OCR markdown extraction with AI-powered cleanup (default: `gpt-4o-mini`, or local ONNX models)
- **AI post-processing** — after cleanup, runs a configurable plugin workflow: deck summary, team extraction, link extraction, a "What if you could…" investor statement, favicon fetch, and a full-page website screenshot; each step writes its own named output file; all steps are on by default and individually opt-out (`--no-summary`, `--no-team`, `--no-links`, `--no-whatif`, `--no-favicon`, `--no-screenshot`)
- **Complete bundles** — each deck gets its own folder with PDF, markdown, post-processing outputs, `summary.json`, and a zip archive
- **Smart naming** — detects deck titles from slide content and uses friendly filenames; title detection uses OpenAI structured JSON output for reliable parsing
- **Login support** — handles private and email-gated decks with per-deck session management
- **Fast parallel downloads** — all slides download concurrently with automatic retries
- **Works with both** `docsend.com` and `dbx.docsend.com` URLs (including custom subdomains)
- **Plugin architecture** — new deck sources can be added by implementing a single `DeckSource` interface; post-processing steps are individual plugin files under `src/lib/plugins/`; the output pipeline is source-agnostic
- **Headless by default** — runs in the background; use `--no-headless` to watch the browser

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
deckrd https://docsend.com/view/XXXXXX
```

## Usage

### Download as PDF (default)

```bash
deckrd https://docsend.com/view/XXXXXX
deckrd https://dbx.docsend.com/view/XXXXXX
```

Output: everything for a deck goes under **`<parent>/<slug>/`**, where `parent` is the current directory by default (or the directory you pass with **`-o`**) and `slug` is the URL-derived DocSend slug (sanitized for the filesystem). Inside that folder you get **`{name}.pdf`**, OCR/cleaned **markdown**, AI post-processing outputs, a **`summary.json`** (paths, sizes, estimated AI costs, download timestamp, etc.), slide PNGs under **`images/`** (by default), and a **`{name}.zip`** containing those artifacts.

**Breaking change (paths):** `-o` is now a **parent directory** (or a path ending in `.pdf`, in which case the parent is `dirname` of that path — the filename is ignored). Files are **not** written as `parent/DeckTitle.pdf` at the top level; they are written as **`parent/<slug>/{name}.pdf`** (and the same folder for markdown, zip, and `summary.json`).

### Markdown (OCR + cleanup) — on by default

By default, the CLI runs **OCR markdown** and **model cleanup** alongside the PDF (same base name as the PDF):

```bash
deckrd https://docsend.com/view/XXXXXX
```

This runs OCR (tesseract.js) on each slide and writes **`{name}.ocr.md`**, then cleans it to **`{name}.md`** using the model in `~/.deckrd/config.json` (`markdownCleanupModel`). **Default model is `gpt-4o-mini` via the OpenAI API** — set **`OPENAI_API_KEY`** (see [OpenAI API key](#openai-api-key-environment-variable)). For fully local cleanup without API keys, set `markdownCleanupModel` to `"350m"` or `"1.2b"` (Liquid Nano Extract ONNX; first run downloads the model).

**Opt out:**

- **`--no-markdown`** — PDF (or `--format png`) only; skip OCR and cleaned markdown output.
- **`--no-cleanup`** — Keep **`{name}.ocr.md`** only; skip cleaned markdown (faster, no API / local model for cleanup). Also skips post-processing since it requires cleaned markdown.

### AI Post-Processing — on by default

After markdown cleanup, deckrd runs a **post-processing workflow** on the cleaned markdown. Each step is an independent plugin that calls OpenAI and writes its own output file:

| Step         | Output file                      | Description                                                                   |
| ------------ | -------------------------------- | ----------------------------------------------------------------------------- |
| `summary`    | `{name}.summary.md`              | Executive summary: company, problem, solution, traction, ask                  |
| `team`       | `{name}.team.md`                 | Team profiles: founders called out, roles, backgrounds, LinkedIn URLs, emails |
| `links`      | `{name}.links.md`                | All URLs categorized by type (LinkedIn, websites, references, social)         |
| `whatif`     | `{name}.whatif.md`               | A single "What if you could…" investor statement                              |
| `favicon`    | `{name}.favicon.{ico\|png\|svg}` | Company favicon fetched from the website URL found in the deck                |
| `screenshot` | `{name}.screenshot.png`          | Full-page screenshot of the company's main website                            |

All six steps run by default. Disable individual steps:

```bash
deckrd https://docsend.com/view/XXXXXX --no-whatif
deckrd https://docsend.com/view/XXXXXX --no-summary --no-team
deckrd https://docsend.com/view/XXXXXX --no-favicon --no-screenshot
deckrd https://docsend.com/view/XXXXXX --no-cleanup   # skips all post-processing too
```

Post-processing only runs when cleanup produced a cleaned `.md` file. If `OPENAI_API_KEY` is not set, all steps are silently skipped.

The active set of steps can also be restricted via `postProcessSteps` in `~/.deckrd/config.json` (see [Config](#config)).

All post-processing output files are included in the **`{name}.zip`** bundle and their paths appear in **`summary.json`** under `postProcessPaths`.

### Title detection

PDF and markdown filenames are not always the DocSend URL slug. When slides are available, the tool **detects a friendly name** from the first slide:

1. OCR is run on the first slide image.
2. The same model as `--cleanup` (OpenAI or local Extract) is asked to extract company and/or product name and return a short filename ending with `-deck` (e.g. `AcmeCorp-ProductName-deck`). OpenAI title detection uses **structured JSON output** (`response_format: json_object`) for reliable parsing without regex fallbacks.
3. The result is sanitized for filenames (letters, numbers, hyphens only) and used as the base name for the PDF and markdown files (`.ocr.md` for OCR output, `.md` for cleaned text).

If detection fails (no slides, empty OCR, or model error), the DocSend deck slug is used as before.

### Options

These match **`deckrd --help`** / **`deckrd download --help`** (wording may wrap in the terminal).

- **`-o, --output <path>`** — **Parent directory** for deck output. Each run writes to **`<parent>/<slug>/`**. If `path` ends with **`.pdf`**, only the **parent** is used (`dirname` of `path`); the filename is ignored.
- **`--format <pdf|png>`** — **`pdf`** (default): cache slides under `~/.deckrd/cache/…`, assemble one PDF, optionally copy slides into **`<slug>/images/`** for the bundle. **`png`**: no PDF; downloads go to **`<slug>/images/`**.
- **`--no-bundle-images`** — **PDF:** do not copy slides into **`<slug>/images/`** and do not add them to the zip (cache is still used for the PDF). **PNG:** slides stay on disk under **`images/`**, but they are **omitted from the zip**.
- **`--images`** — **Deprecated** — same as **`--format png`** (stderr warning).
- **`-m, --markdown`** — Write OCR markdown (default: **on**). Pair with **`--no-markdown`** to disable.
- **`--no-markdown`** — Skip OCR; output PDF and/or image files only.
- **`--cleanup`** — Run the cleanup model on OCR text (default: **on**). Writes **`{name}.md`**.
- **`--no-cleanup`** — Keep **`{name}.ocr.md`** only; no cleaned **`.md`**. Also skips all post-processing steps.
- **`--no-summary`** — Skip the deck summary post-processing step.
- **`--no-team`** — Skip the team extraction post-processing step.
- **`--no-links`** — Skip the links extraction post-processing step.
- **`--no-whatif`** — Skip the "What if you could…" post-processing step.
- **`--no-favicon`** — Skip the favicon fetch post-processing step.
- **`--no-screenshot`** — Skip the website screenshot post-processing step.
- **`--force`** — Re-download slides even if they already exist (**`~/.deckrd/cache`** for PDF format, or **`<slug>/images`** for PNG). Without it, cached/on-disk slides are reused when possible.
- **`--no-headless`** — Show Chromium (useful for login or debugging).
- **`--json`** — Print the run summary as JSON on **stdout** (no banner). **`summary.json`**, the zip, and other files are still written under **`<parent>/<slug>/`**.
- **`--debug`** — Verbose messages on **stderr** (URLs, extraction, model/title steps, post-processing plugin calls).
- **`--email <address>`** — For "require email" gates: adds `?email=` to the URL and tries to submit the modal. Inbox verification still needs **`deckrd login`** or **`--no-headless`** in many cases.

### Login (for private or email-gated decks)

Login is **per deck**: each DocSend URL has its own saved session, so you can use different accounts for different decks.

1. Run login with the deck URL you want to access:

   ```bash
   deckrd login https://docsend.com/view/private-deck-id
   ```

2. Log in with the account that can access that deck, then press Enter in the terminal.

3. Download that deck (uses the session you just saved):

   ```bash
   deckrd https://docsend.com/view/private-deck-id
   ```

To use a different email for another deck, run `deckrd login <other-url>` and log in with the other account; sessions are stored separately per deck.

For a **simple** email-only gate (enter email → Continue), you can try:

```bash
deckrd --email you@company.com https://docsend.com/view/XXXXXX
```

If DocSend sends a verification link, `--email` alone is not enough; use login or a headed browser as above.

### Logout

Clear saved login for one deck or all:

```bash
deckrd logout https://docsend.com/view/xxxxx   # clear this deck's login
deckrd logout                                 # clear all saved logins
```

### Commands

- **`deckrd [url]`** — Download deck at URL (default).
- **`deckrd download [url]`** — Same, with explicit command.
- **`deckrd login <url>`** — Open browser to log in for this deck; session stored per deck under `~/.deckrd/profiles/`.
- **`deckrd logout [url]`** — Clear saved login for the given deck, or all decks if no URL.
- **`-v, --version`** — Print version only.
- **`-h, --help`** — Show help.

## How It Works

1. Detects the deck source from the URL (currently DocSend), opens the page in Chromium (Playwright), using that deck's saved login if you ran `deckrd login <url>` for it.
2. The source extracts each slide's image URL (DocSend: via the page's `page_data` endpoints).
3. Downloads all slide images in parallel with retries.
4. If slide images are already present (**`<slug>/images/`** for PNG format, or `~/.deckrd/cache/<slug>/` for PDF), skips downloading unless **`--force`** is used; then assembles PDF and/or runs markdown/cleanup/rename as requested.
5. Writes the PDF and (unless **`--no-markdown`**) **`{name}.ocr.md`** into **`<parent>/<slug>/`**.
6. Detects a friendly name (first-slide text + configured model, using structured JSON output for OpenAI) and (unless **`--no-cleanup`**) cleans markdown, then renames the PDF and markdown files (`.ocr.md`, `.md`) when the name differs from the slug.
7. Runs the **post-processing workflow** on the cleaned markdown (unless `--no-cleanup` was used): LLM plugins call OpenAI and write their output files (`{name}.summary.md`, `{name}.team.md`, `{name}.links.md`, `{name}.whatif.md`); action plugins perform HTTP/browser work (`{name}.favicon.{ext}`, `{name}.screenshot.png`) — the `favicon` and `screenshot` plugins use a small OpenAI call to extract the company website URL from the deck, then fetch the favicon and take a full-page Playwright screenshot respectively. Individual steps can be skipped with `--no-summary`, `--no-team`, `--no-links`, `--no-whatif`, `--no-favicon`, `--no-screenshot`.
8. Writes **`summary.json`** (same fields as **`--json`** stdout, plus `slug`, `deckDir`, `downloadedAt`, `postProcessPaths`, etc.), builds **`{name}.zip`** (PDF/markdown/post-processing outputs/`summary.json`/bundled **`images/`** when applicable), then prints a **summary** with dim rules and **OSC 8** `file://` links where the terminal supports them.

## Config

Config and browser profile are stored in `~/.deckrd/`:

- `config.json` — e.g. `headless`, `concurrency`, `maxRetries`, `useStoredLogin`, `markdownCleanupModel`, `markdownContextLimitTokens`, `markdownCleanupFullDoc`, `postProcessSteps`. Model choice lives here; **the OpenAI API key does not** — use the **`OPENAI_API_KEY` environment variable** ([below](#openai-api-key-environment-variable)).
- **`markdownCleanupModel`** — Which model to use for title detection, markdown cleanup, and post-processing. **Default: `"gpt-4o-mini"`** (OpenAI; requires `OPENAI_API_KEY` in the environment). For local ONNX only, use `"350m"` or `"1.2b"`. Any model id starting with `gpt-` uses the OpenAI API. Stored in `config.json`.
- **`markdownContextLimitTokens`** — Model context window in tokens (default 32000). Used when full-doc cleanup is enabled.
- **`markdownCleanupFullDoc`** — For **local** models (`350m` / `1.2b`) only: when `true`, cleanup may run on the full document in one call when within `markdownContextLimitTokens` (faster but can trigger structured/XML output from Extract models). When `false` (default), cleanup runs slide-by-slide. **OpenAI** models use one full-deck request whenever the deck fits the internal ~120k-token budget, regardless of this flag.
- **`postProcessSteps`** — Array of plugin IDs to include in the post-processing workflow. Defaults to all built-in plugins: `["summary", "team", "links", "whatif", "favicon", "screenshot"]`. Use this to permanently restrict which steps run (e.g. `["summary", "whatif"]`). Individual steps can also be disabled per-run with `--no-summary`, `--no-team`, `--no-links`, `--no-whatif`, `--no-favicon`, `--no-screenshot`.
- `profiles/<key>/` — One browser profile per deck (key = slug or `v-SPACE-NAME`). Used when you run `deckrd login <url>` for that deck.

### OpenAI API key (environment variable)

OpenAI models read the secret from the **`OPENAI_API_KEY`** environment variable only — it is **not** stored in `~/.deckrd/config.json` (so the key is not mixed with normal preferences or committed by mistake).

The CLI loads [dotenv](https://github.com/motdotla/dotenv) at startup, so if a **`.env`** file exists in the **current working directory** when you run `deckrd`, variables from it are applied (e.g. `OPENAI_API_KEY=sk-...`). You can also:

- **Export in the shell** (session or add to `~/.zshrc` / `~/.bashrc`):  
  `export OPENAI_API_KEY=sk-...`
- **Set in your IDE / terminal profile** for integrated runs
- **Set in CI or deployment** environment config (GitHub Actions secrets, etc.)

See also [`.env.example`](.env.example) in the repo.

### OpenAI (default)

Title detection, `--cleanup`, and post-processing all default to **`gpt-4o-mini`** via the [OpenAI API](https://platform.openai.com/docs).

If `OPENAI_API_KEY` is missing while an OpenAI model is selected, cleanup, title detection, and post-processing fall back gracefully (raw OCR text, DocSend slug, and no post-processing output files).

With **`--debug`**, each OpenAI call logs to stderr: **latency** (ms), **token usage** from the API (`prompt_tokens`, `completion_tokens`, `total_tokens`), and an **approximate USD cost** (rough rates for common models; not billing-authoritative). Slide-by-slide cleanup also prints a **sum** line after all slides.

OpenAI cleanup uses **one full-deck request** when the estimated prompt + output fits a ~120k-token budget (typical decks). Only very large OCR output falls back to slide-by-slide. This ignores `markdownCleanupFullDoc`, which applies to **local** ONNX models only.

### Local ONNX / Liquid AI models

Set `markdownCleanupModel` to **`350m`** or **`1.2b`** to use **Liquid AI LFM2 Extract** (ONNX, via [Transformers.js](https://huggingface.co/docs/transformers.js)), from the [Liquid Nanos](https://huggingface.co/collections/LiquidAI/liquid-nanos) collection. These checkpoints are tuned for structured extraction; if you see XML or angle-bracket output, prefer **slide-by-slide** (default: `markdownCleanupFullDoc: false`) and/or **`1.2b`**.

Note: post-processing always uses the OpenAI API regardless of `markdownCleanupModel`, since local ONNX models are not suited for long-form analysis tasks.

| Option | Model (Hugging Face)                    | Notes                  |
| ------ | --------------------------------------- | ---------------------- |
| `350m` | `onnx-community/LFM2-350M-Extract-ONNX` | Smaller, faster        |
| `1.2b` | `onnx-community/LFM2-1.2B-Extract-ONNX` | Larger; higher quality |

Models are downloaded on first use and cached. See [Liquid AI docs](https://docs.liquid.ai/docs/models/lfm2-350m-extract) and the [onnx-community](https://huggingface.co/onnx-community) space for details.

## Limitations

- Only public decks are supported without login; for email-gated or private decks, use `deckrd login <url>` for that deck first, use `--email <address>` with an email address to login and fetch slides, or use `--no-headless` to log in manually in a one-off run.
- Requires Chromium installed via `playwright install chromium`.
- OCR markdown (on by default; use **`--no-markdown`** to skip) can be slow on large decks; text quality depends on slide image clarity.
- With **local** models (`350m` / `1.2b`), cleanup downloads an ONNX model on first use (hundreds of MB) and runs locally. With **OpenAI** (default), cleanup requires network access and a valid API key. Use **`--no-cleanup`** to skip. Cleanup runs slide-by-slide by default for local models. If local cleanup seems to stall, run with **`--debug`** to see progress.
- Post-processing requires `OPENAI_API_KEY` regardless of `markdownCleanupModel`; steps are silently skipped when the key is absent.

## Project Structure

```
deckrd/
├── dist/                        # Compiled output (generated by pnpm build)
├── src/
│   ├── cli.ts                   # Entry point: Commander program setup, root command action
│   ├── banner.ts                # ASCII art welcome banner (shown unless --json)
│   ├── commands/                # One file per CLI subcommand
│   │   ├── download.ts          # `deckrd download` — core download orchestration (PDF + PNG paths)
│   │   ├── login.ts             # `deckrd login` — open browser and save session per deck
│   │   └── logout.ts            # `deckrd logout` — clear saved sessions
│   └── lib/                     # Shared library modules (no CLI concerns)
│       ├── sources/             # Deck source plugin system
│       │   ├── index.ts         # Source registry: detectSource(), getSourceById(), getSourceIds()
│       │   ├── base.ts          # Shared Playwright helpers: launchBrowserContext(), tryPassEmailGate(), loginWithBrowser()
│       │   └── docsend.ts       # DocSend DeckSource implementation (URL parsing, Playwright scraping, page_data API)
│       ├── plugins/             # Post-processing plugin system (one file per plugin)
│       │   ├── index.ts         # Registry: imports all plugins, exports BUILT_IN_PLUGINS + DEFAULT_POST_PROCESS_STEPS
│       │   ├── plugin-utils.ts  # Shared utility: extractCompanyWebsiteUrl() via OpenAI json_object call
│       │   ├── summary.ts       # summaryPlugin — executive summary (## sections, factual)
│       │   ├── team.ts          # teamPlugin — all team members; founders/co-founders called out, LinkedIn URLs, emails
│       │   ├── links.ts         # linksPlugin — categorized URL extraction
│       │   ├── whatif.ts        # whatifPlugin — single "What if you could…" investor sentence
│       │   ├── favicon.ts       # faviconPlugin — fetches company favicon via HTTP (/favicon.ico + HTML <link> fallback)
│       │   └── screenshot.ts    # screenshotPlugin — full-page Playwright screenshot of company website
│       ├── assembler.ts         # PDF assembly from slide PNGs (pdf-lib)
│       ├── cli-icons.ts         # CLI status symbols and ANSI colors (figures + picocolors)
│       ├── constants.ts         # Shared constants: USER_AGENT, DEFAULT_CONTEXT_LIMIT_TOKENS
│       ├── deck-output.ts       # Slide bundling into images/ and ZIP archive creation
│       ├── downloader.ts        # Parallel slide image downloader with retries
│       ├── extractor.ts         # Backward-compat shim re-exporting from sources/docsend.ts
│       ├── fs-utils.ts          # Filesystem helpers: listSlideFiles, dirHasAllSlides, totalSlideBytesInDir
│       ├── logger.ts            # Unified debug logger (debugLog)
│       ├── markdown-cleanup.ts  # OCR markdown cleanup: local ONNX models, shared prompts and utilities
│       ├── ocr-markdown.ts      # Tesseract OCR: slide images → structured markdown
│       ├── openai-cleanup.ts    # OpenAI-specific cleanup and title detection (structured JSON output for titles)
│       ├── output.ts            # CLI output formatting: summary table, errors, OSC 8 file links
│       ├── post-processing.ts   # Post-processing engine: runPostProcessWorkflow(), outputPathForPlugin()
│       ├── storage.ts           # Config, browser profiles, slide cache dirs, deck paths, cache metadata
│       ├── stream-utils.ts      # Streaming write buffer and text preview helpers
│       ├── types.ts             # Shared TypeScript types and interfaces (DeckInfo, DeckSource, PostProcessPlugin, DownloadOptions, Config, …)
│       └── __fixtures__/        # Static files used by tests
├── package.json
├── tsconfig.json
├── tsup.config.ts               # Build config (tsup, ESM, node18)
└── vitest.config.ts             # Test config (vitest)
```

**Runtime data** (outside the repo) lives under `~/.deckrd/`:

```
~/.deckrd/
├── config.json          # User preferences (headless, model, concurrency, postProcessSteps, …)
├── profiles/<key>/      # Per-deck Chromium browser profiles (from deckrd login)
└── cache/<slug>/        # Cached slide PNGs for PDF format (reused across runs)
```

**Example deck output folder:**

```
./<parent>/<slug>/
├── {name}.pdf               # Assembled PDF
├── {name}.ocr.md            # Raw OCR markdown
├── {name}.md                # AI-cleaned markdown
├── {name}.summary.md        # Executive summary (post-processing)
├── {name}.team.md           # Team profiles — founders called out (post-processing)
├── {name}.links.md          # Extracted URLs (post-processing)
├── {name}.whatif.md         # "What if you could…" statement (post-processing)
├── {name}.favicon.ico       # Company favicon (post-processing; extension varies: .ico, .png, .svg)
├── {name}.screenshot.png    # Full-page website screenshot (post-processing)
├── summary.json             # Run metadata (paths, sizes, AI costs, downloadedAt, postProcessPaths)
├── {name}.zip               # All of the above bundled
└── images/                  # Slide PNGs (when --bundle-images, default on)
    ├── slide_01.png
    └── …
```

## Deck Sources & Plugin Architecture

deckrd separates **source-specific extraction** from the **shared output pipeline**. Every source implements a single `DeckSource` interface; the rest of the codebase (downloader, PDF assembler, OCR, AI cleanup, post-processing, ZIP) is source-agnostic and never needs to change when a new source is added.

### The `DeckSource` interface

Defined in `src/lib/types.ts`:

```typescript
interface DeckSource {
  readonly id: string; // unique key, e.g. "docsend", "google", "pitchdeck"
  readonly name: string; // human-readable, e.g. "DocSend", "Google Slides"
  readonly exampleUrl: string; // shown in help text

  /** Return true if this source can handle the given URL. */
  canHandle(url: string): boolean;

  /**
   * Parse a URL-derived identifier used as the cache key fragment.
   * Return null when no identifier can be extracted (e.g. space/name URLs).
   * Throw InvalidURLError for URLs that are structurally invalid for this source.
   */
  parseIdentifier(url: string): string | null;

  /**
   * Return a profile key for per-deck login storage.
   * Throw InvalidURLError for invalid URLs.
   */
  getProfileKey(url: string): string;

  /**
   * Core extraction: launch browser, navigate to URL, return DeckInfo.
   * The returned DeckInfo must set sourceId to this source's id.
   * Shared Playwright helpers are available in src/lib/sources/base.ts.
   */
  extractSlideUrls(url: string, options: ExtractOptions): Promise<DeckInfo>;

  /**
   * Optional: override the login flow for this source.
   * When absent, the generic Playwright persistent-context login is used.
   */
  login?(
    url: string,
    profileDir: string,
    options: { headless?: boolean },
  ): Promise<void>;
}
```

### Source registry

`src/lib/sources/index.ts` holds the ordered list of registered sources. URL detection iterates the list and calls `canHandle(url)` on each; the first match wins. If no source matches, the default (DocSend) is returned, which will throw `InvalidURLError` for truly invalid input.

```typescript
// src/lib/sources/index.ts
const SOURCES: DeckSource[] = [docsendSource]; // ← register new sources here
```

### Shared Playwright helpers

`src/lib/sources/base.ts` exports utilities all sources can use:

| Export                                       | Purpose                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| `launchBrowserContext(options)`              | Launch a Playwright context, optionally with a persistent profile directory    |
| `tryPassEmailGate(page, email, debug)`       | Fill an email input and click Continue; returns true when the carousel appears |
| `loginWithBrowser(url, profileDir, options)` | Generic persistent-context login: open browser, navigate, wait for user, close |

### How to add a new source

**1. Create `src/lib/sources/<name>.ts`** and export a `DeckSource` object:

```typescript
// src/lib/sources/google.ts
import type { DeckSource, DeckInfo, ExtractOptions } from "../types.js";
import { InvalidURLError } from "../types.js";
import { launchBrowserContext } from "./base.js";

export const googleSource: DeckSource = {
  id: "google",
  name: "Google Slides",
  exampleUrl: "https://docs.google.com/presentation/d/XXXXXX/pub",

  canHandle(url) {
    return /^https:\/\/docs\.google\.com\/presentation\/d\//.test(url);
  },

  parseIdentifier(url) {
    const m = url.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
    if (!m) throw new InvalidURLError(`Invalid Google Slides URL: ${url}`);
    return m[1];
  },

  getProfileKey(url) {
    return this.parseIdentifier(url) ?? url;
  },

  async extractSlideUrls(url, options): Promise<DeckInfo> {
    const context = await launchBrowserContext({ headless: options.headless });
    // ... source-specific scraping logic ...
    await context.close();
    return {
      sourceId: "google",
      title: "My Deck",
      slideCount: 10,
      imageUrls: [
        /* signed image URLs */
      ],
      warnings: [],
      slug: this.parseIdentifier(url),
    };
  },
};
```

**2. Register it in `src/lib/sources/index.ts`:**

```typescript
import { docsendSource } from "./docsend.js";
import { googleSource } from "./google.js";

const SOURCES: DeckSource[] = [docsendSource, googleSource];
```

### Currently registered sources

| id        | Name    | URL pattern            | Status                   |
| --------- | ------- | ---------------------- | ------------------------ |
| `docsend` | DocSend | `*.docsend.com/view/…` | ✅ Implemented (default) |

## Post-Processing Plugin Architecture

After markdown cleanup, deckrd runs a **post-processing workflow** — a sequence of plugins that each receive the cleaned markdown, call OpenAI, and write a named output file. The plugin system mirrors the deck source architecture: each plugin is a separate file under `src/lib/plugins/`, and the registry in `src/lib/plugins/index.ts` controls which plugins are available.

### Plugin interfaces

Two plugin interfaces are defined in `src/lib/types.ts`:

**`PostProcessPlugin`** — LLM-driven plugins that send the cleaned markdown to OpenAI and write the response:

```typescript
interface PostProcessPlugin {
  id: string; // unique key used as the CLI flag name and registry key, e.g. "summary"
  label: string; // display name shown in the spinner, e.g. "Summarizing deck"
  outputSuffix: string; // appended to the deck title: "summary" → {name}.summary.md
  outputFormat: "md" | "json" | "csv"; // file extension; currently all built-ins use "md"
  systemPrompt: string; // full system prompt sent to the OpenAI model
  maxTokens: number; // max completion tokens for this step
  model?: string; // optional model override; defaults to the workflow's configured model (e.g. "gpt-4o-mini")
}
```

**`ActionPlugin`** — Custom async plugins that implement their own `run()` method (HTTP fetches, browser automation, etc.):

```typescript
interface ActionPlugin {
  id: string; // unique key used as the CLI flag name and registry key, e.g. "favicon"
  label: string; // display name shown in the spinner, e.g. "Fetching favicon"
  outputSuffix: string; // base suffix for the output filename, e.g. "favicon"
  run(
    markdown: string, // the full cleaned deck markdown
    outputDir: string, // deck output directory to write files into
    title: string, // deck title (used for output filenames)
    options: ActionPluginRunOptions,
  ): Promise<PostProcessResult>;
}
```

The engine in `src/lib/post-processing.ts` uses a type guard (`isActionPlugin`) to branch: LLM plugins call `client.chat.completions.create` and write the response; action plugins call their `run()` method directly.

### Plugin registry

`src/lib/plugins/index.ts` imports all plugin files and exports:

- **`BUILT_IN_PLUGINS`** — `Record<string, PostProcessPlugin | ActionPlugin>` keyed by plugin ID
- **`DEFAULT_POST_PROCESS_STEPS`** — ordered array of IDs run when no `postProcessSteps` config is set: `["summary", "team", "links", "whatif", "favicon", "screenshot"]`

The workflow engine looks plugins up by ID from this registry; unknown IDs are skipped with a debug warning.

---

### Built-in plugins

#### `summary` — Executive summary

**File:** `src/lib/plugins/summary.ts`  
**Output:** `{name}.summary.md`  
**CLI flag to skip:** `--no-summary`  
**Max tokens:** 2048

Reads the full cleaned deck markdown and produces a structured executive summary aimed at investors and analysts. The model is instructed to cover:

- What the company does
- The problem it solves
- The solution
- Traction and metrics (if present in the deck)
- The ask (funding amount, use of funds)

Each section is output as a `##` heading in clean markdown. The summary is factual and concise — no editorializing.

---

#### `team` — Team profiles

**File:** `src/lib/plugins/team.ts`  
**Output:** `{name}.team.md`  
**CLI flag to skip:** `--no-team`  
**Max tokens:** 2048

Extracts every person mentioned in the deck — founders, co-founders, executives, and advisors. The output opens with a **Founders & Co-Founders** section that lists them by name and role so they are immediately visible, followed by a full profile for each person:

- Role/title
- Founder or co-founder flag (called out explicitly)
- Key role flag (CEO, CTO, COO, CFO, CPO, CRO, Advisor)
- Bio and background summary
- Past companies and experiences
- LinkedIn URL (if mentioned)
- Email (if mentioned)

If no people are mentioned in the deck, the file says so.

---

#### `links` — URL extraction

**File:** `src/lib/plugins/links.ts`  
**Output:** `{name}.links.md`  
**CLI flag to skip:** `--no-links`  
**Max tokens:** 1024

Scans the cleaned markdown for every URL and link, then groups them into categories under `##` headings:

- LinkedIn profiles
- Company websites
- Reference sources
- Social media
- Other

Useful for quickly finding all external references in a deck — investor profiles, product pages, press mentions, data sources, etc. If no links are found, the file says so.

---

#### `whatif` — "What if you could…" investor statement

**File:** `src/lib/plugins/whatif.ts`  
**Output:** `{name}.whatif.md`  
**CLI flag to skip:** `--no-whatif`  
**Max tokens:** 128

Generates a single sharp sentence in the style of **Preston-Werner Ventures (PWV)** that communicates the company's core market opportunity to an investor in plain language. The prompt instructs the model to:

1. Start with **"What if you could…"**
2. Describe the new capability or freedom unlocked — in plain, non-technical language
3. Remove a painful, widely felt limitation (time, cost, complexity, intermediaries, uncertainty)
4. Imply scale without hype — no adjectives, no feature descriptions, no technology mentions

**Canonical style examples the model is given:**

- _What if you could spin up VMs in 3 milliseconds?_
- _What if you didn't need a business bank account to accept money online?_
- _What if you could stay at anyone's place, coordinated over the internet?_
- _What if you could get a ride anywhere in the city and always know when it will arrive?_

The output is a single sentence only — no explanation, no commentary.

---

#### `favicon` — Company favicon

**File:** `src/lib/plugins/favicon.ts`  
**Output:** `{name}.favicon.{ico|png|svg}`  
**CLI flag to skip:** `--no-favicon`  
**Type:** `ActionPlugin` (no LLM call for the fetch itself)

Uses a small OpenAI call (`response_format: json_object`) to extract the company's primary website URL from the cleaned markdown, then fetches the favicon using two strategies in order:

1. **`/favicon.ico`** — tries `{websiteUrl}/favicon.ico` directly; accepts the result if the response is OK and the body is non-trivial (> 100 bytes).
2. **HTML `<link rel="icon">`** — fetches the homepage HTML and parses `<link rel="icon">` or `<link rel="shortcut icon">` tags to find the canonical icon URL, then fetches that.

The file extension (`.ico`, `.png`, or `.svg`) is determined from the `Content-Type` response header. If no website URL is found in the deck or all fetch strategies fail, the step is skipped gracefully with a warning.

---

#### `screenshot` — Website screenshot

**File:** `src/lib/plugins/screenshot.ts`  
**Output:** `{name}.screenshot.png`  
**CLI flag to skip:** `--no-screenshot`  
**Type:** `ActionPlugin` (uses Playwright, no LLM call for the screenshot itself)

Uses a small OpenAI call (`response_format: json_object`) to extract the company's primary website URL from the cleaned markdown, then launches a headless Chromium browser (via Playwright — already installed for deck scraping) and takes a **full-page screenshot** at 1280×800 viewport. The browser is always closed after the screenshot, even on error.

If no website URL is found in the deck or navigation fails (timeout, network error, etc.), the step is skipped gracefully with a warning.

---

### How to add a new post-processing plugin

Adding a plugin requires four small changes. Use the `competitors` plugin as a worked example.

**Step 1 — Create `src/lib/plugins/<name>.ts`**

For an **LLM plugin**, export a `PostProcessPlugin` constant. The `systemPrompt` is the only thing that meaningfully varies — write it as if you were briefing a senior analyst:

```typescript
// src/lib/plugins/competitors.ts
import type { PostProcessPlugin } from "../types.js";

export const competitorsPlugin: PostProcessPlugin = {
  id: "competitors",
  label: "Extracting competitors",
  outputSuffix: "competitors",
  outputFormat: "md",
  systemPrompt: `You are a competitive intelligence analyst. Extract all competitors and market alternatives mentioned in the following pitch deck markdown. For each, include: name, how the deck positions against them, claimed advantages, and any URLs mentioned. Output clean markdown with a ## heading per competitor. If no competitors are mentioned, say so.`,
  maxTokens: 1024,
  // model: "gpt-4o",  // optional: override the default model for this plugin only
};
```

For an **action plugin** (HTTP, browser, or other async work), export an `ActionPlugin` constant with a `run()` method:

```typescript
// src/lib/plugins/my-action.ts
import type {
  ActionPlugin,
  ActionPluginRunOptions,
  PostProcessResult,
} from "../types.js";
import { join } from "path";

export const myActionPlugin: ActionPlugin = {
  id: "my-action",
  label: "Doing something custom",
  outputSuffix: "my-action",
  async run(markdown, outputDir, title, options): Promise<PostProcessResult> {
    const outputPath = join(outputDir, `${title}.my-action.txt`);
    // ... do async work, write outputPath ...
    return {
      pluginId: "my-action",
      outputPath,
      success: true,
      estimatedCostUsd: null,
    };
  },
};
```

**Step 2 — Register it in `src/lib/plugins/index.ts`**

```typescript
import { summaryPlugin } from "./summary.js";
import { teamPlugin } from "./team.js";
import { linksPlugin } from "./links.js";
import { whatifPlugin } from "./whatif.js";
import { faviconPlugin } from "./favicon.js";
import { screenshotPlugin } from "./screenshot.js";
import { competitorsPlugin } from "./competitors.js"; // ← add

export const BUILT_IN_PLUGINS: Record<
  string,
  PostProcessPlugin | ActionPlugin
> = {
  summary: summaryPlugin,
  team: teamPlugin,
  links: linksPlugin,
  whatif: whatifPlugin,
  favicon: faviconPlugin,
  screenshot: screenshotPlugin,
  competitors: competitorsPlugin, // ← add
};
```

**Step 3 — Add `competitors?: boolean` to `DownloadOptions` in `src/lib/types.ts`**

```typescript
// in DownloadOptions:
/** Run competitors extraction post-processing step. Defaults to `true` (CLI: `--no-competitors` to disable). */
competitors?: boolean;
```

**Step 4 — Add `--no-competitors` to `src/commands/download.ts`**

In `registerDownloadCommand`, alongside the other `--no-*` flags:

```typescript
.option("--no-competitors", "Skip competitors extraction post-processing step")
```

And in `resolvePostProcessSteps`, add `competitors` to the flags map:

```typescript
const flags: Record<string, boolean | undefined> = {
  summary: options.summary,
  team: options.team,
  links: options.links,
  whatif: options.whatif,
  competitors: options.competitors, // ← add
};
```

**That's it.** The new plugin will automatically:

- Run as part of the default workflow
- Write `{name}.competitors.md` to the deck folder
- Be included in `{name}.zip`
- Appear in `summary.json` under `postProcessPaths.competitors`
- Be skippable with `--no-competitors` or by omitting `"competitors"` from `postProcessSteps` in `~/.deckrd/config.json`

## Development

```bash
pnpm install
pnpm dev -- <args>    # Run with tsx
pnpm build            # Build with tsup
pnpm test             # Run vitest
```

**CLI icons** — Status symbols for ora spinners and the download summary are defined in `src/lib/cli-icons.ts`: raw glyphs in `CLI_ICONS`, semantic ANSI colors in `CLI_ICONS_COLOR` (picocolors). Edit that file to swap characters or colors app-wide (glyphs use the [`figures`](https://github.com/sindresorhus/figures) package).

## Image Generation Prompt

```
minimalist terminal UI illustration, dark mode GitHub README style, black background with soft gradient, neon green and cyan accent colors, monospaced typography, clean CLI interface, glowing text and subtle blur bloom, futuristic developer tool vibe, centered composition, high contrast, modern dev aesthetic, smooth rounded UI elements, glassy overlay panels, crisp vector lines, minimal noise, elegant and polished, hacker + startup branding style
```

## License

MIT
