# deckli

**They shared a link. You wanted the content.**

A TypeScript CLI that downloads presentation decks and extracts searchable text from slides. Default output includes an assembled PDF, OCR markdown with AI cleanup, slide images, and a complete bundle. Currently supports **DocSend** (default); built with a plugin architecture so additional sources (Google Slides, PitchDeck, Brieflink, etc.) can be added without touching the output pipeline. Inspired by [captivus/docsend-dl](https://github.com/captivus/docsend-dl); thanks to that project.

## The Problem

> *Stop screenshotting slides. Get the text, the PDF, the whole thing.*
> *Decks shouldn't be black boxes. Extract everything.*

DocSend decks are great for sharing presentations, but they're locked in a viewer. Getting the actual content — especially the text — is tedious:

- **No native export**: DocSend doesn't provide a download button for most decks
- **Text is trapped**: Slides are images, so you can't search, copy, or analyze the content
- **Manual work**: Screenshotting slides and transcribing text is slow and error-prone
- **No bulk access**: Fetching multiple decks or organizing them systematically is difficult

**deckli solves this** by automating the entire workflow: fetching slides, extracting text via OCR, cleaning it with AI models, and organizing everything into a structured bundle. You get both the visual slides (PDF/PNG) and the extracted text (markdown) ready for search, analysis, or AI processing.

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
- **Complete bundles** — each deck gets its own folder with PDF, markdown, images, `summary.json`, and a zip archive
- **Smart naming** — detects deck titles from slide content and uses friendly filenames
- **Login support** — handles private and email-gated decks with per-deck session management
- **Fast parallel downloads** — all slides download concurrently with automatic retries
- **Works with both** `docsend.com` and `dbx.docsend.com` URLs (including custom subdomains)
- **Plugin architecture** — new deck sources can be added by implementing a single `DeckSource` interface; the output pipeline is source-agnostic
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
deckli https://docsend.com/view/XXXXXX
```

## Usage

### Download as PDF (default)

```bash
deckli https://docsend.com/view/XXXXXX
deckli https://dbx.docsend.com/view/XXXXXX
```

Output: everything for a deck goes under **`<parent>/<slug>/`**, where `parent` is the current directory by default (or the directory you pass with **`-o`**) and `slug` is the URL-derived DocSend slug (sanitized for the filesystem). Inside that folder you get **`{name}.pdf`**, OCR/cleaned **markdown**, a **`summary.json`** (paths, sizes, estimated AI costs, etc.), slide PNGs under **`images/`** (by default), and a **`{name}.zip`** containing those artifacts (except when there is nothing to add).

**Breaking change (paths):** `-o` is now a **parent directory** (or a path ending in `.pdf`, in which case the parent is `dirname` of that path — the filename is ignored). Files are **not** written as `parent/DeckTitle.pdf` at the top level; they are written as **`parent/<slug>/{name}.pdf`** (and the same folder for markdown, zip, and `summary.json`).

### Markdown (OCR + cleanup) — on by default

By default, the CLI runs **OCR markdown** and **model cleanup** alongside the PDF (same base name as the PDF):

```bash
deckli https://docsend.com/view/XXXXXX
```

This runs OCR (tesseract.js) on each slide and writes **`{name}.ocr.md`**, then cleans it to **`{name}.md`** using the model in `~/.deckli/config.json` (`markdownCleanupModel`). **Default model is `gpt-4o-mini` via the OpenAI API** — set **`OPENAI_API_KEY`** (see [OpenAI API key](#openai-api-key-environment-variable)). For fully local cleanup without API keys, set `markdownCleanupModel` to `"350m"` or `"1.2b"` (Liquid Nano Extract ONNX; first run downloads the model).

**Opt out:**

- **`--no-markdown`** — PDF (or `--format png`) only; skip OCR and cleaned markdown output.
- **`--no-cleanup`** — Keep **`{name}.ocr.md`** only; skip cleaned markdown (faster, no API / local model for cleanup).

The first `#` heading is updated from the DocSend slug to a **readable deck title** when a friendly filename is detected (e.g. `# RenewablesBridge` instead of `# docsend-…`).

### Title detection

PDF and markdown filenames are not always the DocSend URL slug. When slides are available, the tool **detects a friendly name** from the first slide:

1. OCR is run on the first slide image.
2. The same model as `--cleanup` (OpenAI or local Extract) is asked to extract company and/or product name and return a short filename ending with `-deck` (e.g. `AcmeCorp-ProductName-deck`).
3. The result is sanitized for filenames (letters, numbers, hyphens only) and used as the base name for the PDF and markdown files (`.ocr.md` for OCR output, `.md` for cleaned text).

If detection fails (no slides, empty OCR, or model error), the DocSend deck slug is used as before.

### Options

These match **`deckli --help`** / **`deckli download --help`** (wording may wrap in the terminal).

- **`-o, --output <path>`** — **Parent directory** for deck output. Each run writes to **`<parent>/<slug>/`**. If `path` ends with **`.pdf`**, only the **parent** is used (`dirname` of `path`); the filename is ignored.
- **`--format <pdf|png>`** — **`pdf`** (default): cache slides under `~/.deckli/cache/…`, assemble one PDF, optionally copy slides into **`<slug>/images/`** for the bundle. **`png`**: no PDF; downloads go to **`<slug>/images/`**.
- **`--no-bundle-images`** — **PDF:** do not copy slides into **`<slug>/images/`** and do not add them to the zip (cache is still used for the PDF). **PNG:** slides stay on disk under **`images/`**, but they are **omitted from the zip**.
- **`--images`** — **Deprecated** — same as **`--format png`** (stderr warning).
- **`-m, --markdown`** — Write OCR markdown (default: **on**). Pair with **`--no-markdown`** to disable.
- **`--no-markdown`** — Skip OCR; output PDF and/or image files only.
- **`--cleanup`** — Run the cleanup model on OCR text (default: **on**). Writes **`{name}.md`**.
- **`--no-cleanup`** — Keep **`{name}.ocr.md`** only; no cleaned **`.md`**.
- **`--force`** — Re-download slides even if they already exist (**`~/.deckli/cache`** for PDF format, or **`<slug>/images`** for PNG). Without it, cached/on-disk slides are reused when possible.
- **`--no-headless`** — Show Chromium (useful for login or debugging).
- **`--json`** — Print the run summary as JSON on **stdout** (no banner). **`summary.json`**, the zip, and other files are still written under **`<parent>/<slug>/`**.
- **`--debug`** — Verbose messages on **stderr** (URLs, extraction, model/title steps).
- **`--email <address>`** — For "require email" gates: adds `?email=` to the URL and tries to submit the modal. Inbox verification still needs **`deckli login`** or **`--no-headless`** in many cases.

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

For a **simple** email-only gate (enter email → Continue), you can try:

```bash
deckli --email you@company.com https://docsend.com/view/XXXXXX
```

If DocSend sends a verification link, `--email` alone is not enough; use login or a headed browser as above.

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

## How It Works

1. Detects the deck source from the URL (currently DocSend), opens the page in Chromium (Playwright), using that deck's saved login if you ran `deckli login <url>` for it.
2. The source extracts each slide's image URL (DocSend: via the page's `page_data` endpoints).
3. Downloads all slide images in parallel with retries.
4. If slide images are already present (**`<slug>/images/`** for PNG format, or `~/.deckli/cache/<slug>/` for PDF), skips downloading unless **`--force`** is used; then assembles PDF and/or runs markdown/cleanup/rename as requested.
5. Writes the PDF and (unless **`--no-markdown`**) **`{name}.ocr.md`** into **`<parent>/<slug>/`**.
6. Detects a friendly name (first-slide text + configured model) and (unless **`--no-cleanup`**) cleans markdown, then renames the PDF and markdown files (`.ocr.md`, `.md`) when the name differs from the slug.
7. Writes **`summary.json`** (same fields as **`--json`** stdout, plus optional `slug`, `deckDir`, etc.), builds **`{name}.zip`** (PDF/markdown/`summary.json`/bundled **`images/`** when applicable), then prints a **summary** with dim rules and **OSC 8** `file://` links where the terminal supports them.

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

| Option | Model (Hugging Face)                    | Notes                  |
| ------ | --------------------------------------- | ---------------------- |
| `350m` | `onnx-community/LFM2-350M-Extract-ONNX` | Smaller, faster        |
| `1.2b` | `onnx-community/LFM2-1.2B-Extract-ONNX` | Larger; higher quality |

Models are downloaded on first use and cached. See [Liquid AI docs](https://docs.liquid.ai/docs/models/lfm2-350m-extract) and the [onnx-community](https://huggingface.co/onnx-community) space for details.

## Limitations

- Only public decks are supported without login; for email-gated or private decks, use `deckli login <url>` for that deck first (or `--no-headless` to log in manually in a one-off run).
- Requires Chromium installed via `playwright install chromium`.
- OCR markdown (on by default; use **`--no-markdown`** to skip) can be slow on large decks; text quality depends on slide image clarity.
- With **local** models (`350m` / `1.2b`), cleanup downloads an ONNX model on first use (hundreds of MB) and runs locally. With **OpenAI** (default), cleanup requires network access and a valid API key. Use **`--no-cleanup`** to skip. Cleanup runs slide-by-slide by default for local models. If local cleanup seems to stall, run with **`--debug`** to see progress.

## Project Structure

```
deckli/
├── dist/                        # Compiled output (generated by pnpm build)
├── src/
│   ├── cli.ts                   # Entry point: Commander program setup, root command action
│   ├── banner.ts                # ASCII art welcome banner (shown unless --json)
│   ├── commands/                # One file per CLI subcommand
│   │   ├── download.ts          # `deckli download` — core download orchestration (PDF + PNG paths)
│   │   ├── login.ts             # `deckli login` — open browser and save session per deck
│   │   └── logout.ts            # `deckli logout` — clear saved sessions
│   └── lib/                     # Shared library modules (no CLI concerns)
│       ├── sources/             # Deck source plugin system
│       │   ├── index.ts         # Source registry: detectSource(), getSourceById(), getSourceIds()
│       │   ├── base.ts          # Shared Playwright helpers: launchBrowserContext(), tryPassEmailGate(), loginWithBrowser()
│       │   └── docsend.ts       # DocSend DeckSource implementation (URL parsing, Playwright scraping, page_data API)
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
│       ├── openai-cleanup.ts    # OpenAI-specific cleanup and title detection (re-exports isOpenAiModelKey)
│       ├── output.ts            # CLI output formatting: summary table, errors, OSC 8 file links
│       ├── storage.ts           # Config, browser profiles, slide cache dirs, deck paths, cache metadata
│       ├── stream-utils.ts      # Streaming write buffer and text preview helpers
│       ├── types.ts             # Shared TypeScript types and interfaces (DeckInfo, DeckSource, DownloadOptions, Config, …)
│       └── __fixtures__/        # Static files used by tests
├── package.json
├── tsconfig.json
├── tsup.config.ts               # Build config (tsup, ESM, node18)
└── vitest.config.ts             # Test config (vitest)
```

**Runtime data** (outside the repo) lives under `~/.deckli/`:

```
~/.deckli/
├── config.json          # User preferences (headless, model, concurrency, …)
├── profiles/<key>/      # Per-deck Chromium browser profiles (from deckli login)
└── cache/<slug>/        # Cached slide PNGs for PDF format (reused across runs)
```

## Deck Sources & Plugin Architecture

deckli separates **source-specific extraction** from the **shared output pipeline**. Every source implements a single `DeckSource` interface; the rest of the codebase (downloader, PDF assembler, OCR, AI cleanup, ZIP) is source-agnostic and never needs to change when a new source is added.

### The `DeckSource` interface

Defined in `src/lib/types.ts`:

```typescript
interface DeckSource {
  readonly id: string;        // unique key, e.g. "docsend", "google", "pitchdeck"
  readonly name: string;      // human-readable, e.g. "DocSend", "Google Slides"
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
  login?(url: string, profileDir: string, options: { headless?: boolean }): Promise<void>;
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

| Export | Purpose |
|---|---|
| `launchBrowserContext(options)` | Launch a Playwright context, optionally with a persistent profile directory |
| `tryPassEmailGate(page, email, debug)` | Fill an email input and click Continue; returns true when the carousel appears |
| `loginWithBrowser(url, profileDir, options)` | Generic persistent-context login: open browser, navigate, wait for user, close |

### How to add a new source

**1. Create `src/lib/sources/<name>.ts`** and export a `DeckSource` object:

```typescript
// src/lib/sources/google.ts
import type { DeckSource, DeckInfo, ExtractOptions } from "../types.js";
import { InvalidURLError, ExtractionError } from "../types.js";
import { launchBrowserContext } from "./base.js";

const GOOGLE_SLIDES_PATTERN = /^https:\/\/docs\.google\.com\/presentation\/d\//;

export const googleSource: DeckSource = {
  id: "google",
  name: "Google Slides",
  exampleUrl: "https://docs.google.com/presentation/d/XXXXXX/pub",

  canHandle(url) {
    return GOOGLE_SLIDES_PATTERN.test(url);
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
    // Launch browser, navigate, extract slide image URLs...
    const context = await launchBrowserContext({ headless: options.headless });
    // ... source-specific scraping logic ...
    await context.close();

    return {
      sourceId: "google",   // ← must match this source's id
      title: "My Deck",
      slideCount: 10,
      imageUrls: [/* signed image URLs */],
      warnings: [],
      slug: this.parseIdentifier(url),
    };
  },
};
```

**2. Register it in `src/lib/sources/index.ts`:**

```typescript
import { docsendSource } from "./docsend.js";
import { googleSource } from "./google.js";   // ← add import

const SOURCES: DeckSource[] = [
  docsendSource,
  googleSource,   // ← add to list
];
```

That's it. `detectSource(url)` will now route Google Slides URLs to `googleSource` automatically. The download command, login/logout, caching, PDF assembly, OCR, AI cleanup, and ZIP creation all work without any further changes.

**Cache keys** are automatically namespaced as `<sourceId>-<identifier>` (e.g. `google-abc123xyz`), so caches from different sources never collide.

**Login/logout** work per-deck for any source. If your source needs a custom login flow (e.g. OAuth), implement the optional `login(url, profileDir, options)` method; otherwise the generic Playwright persistent-context flow is used.

### Currently registered sources

| id | Name | URL pattern | Status |
|---|---|---|---|
| `docsend` | DocSend | `*.docsend.com/view/…` | ✅ Implemented (default) |

## Development

```bash
pnpm install
pnpm dev -- <args>    # Run with tsx
pnpm build            # Build with tsup
pnpm test             # Run vitest
```

**CLI icons** — Status symbols for ora spinners and the download summary are defined in `src/lib/cli-icons.ts`: raw glyphs in `CLI_ICONS`, semantic ANSI colors in `CLI_ICONS_COLOR` (picocolors). Edit that file to swap characters or colors app-wide (glyphs use the [`figures`](https://github.com/sindresorhus/figures) package).

## License

MIT
