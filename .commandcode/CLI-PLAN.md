# TypeScript DocSend DL CLI — Plan (with CLI conventions)

## Goals

- **Parity with [docsend-dl](https://github.com/captivus/docsend-dl)**: Download public DocSend deck URLs as a single PDF (or as PNGs), using the same flow: open page in Chromium → extract slide image URLs from page data → download images in parallel → assemble PDF.
- **Structure like [clidoro](https://github.com/ahmadawais/clidoro)**: Commander-based CLI, `--json` output, dedicated modules for storage, output formatting, and types.
- **Login support**: One-time login via persistent browser profile (`~/.docsend-dl/browser-profile`) so subsequent runs can access non-public decks without `--no-headless` each time.
- **Conventions**: Follow the project’s CLI rules (pnpm, tsup, vitest, Commander, clack, ora, picocolors, commands folder, banner, version 0.0.1, etc.).

---

## CLI conventions to apply

| Rule | Application |
|------|-------------|
| **Package manager** | pnpm |
| **Build** | tsup (not raw tsc) |
| **Testing** | vitest |
| **CLI framework** | Commander.js |
| **Interactive input** | clack |
| **Spinners** | ora |
| **Terminal colors** | picocolors |
| **Structure** | Commands in `src/commands/`, one module per command |
| **Welcome** | 150px ASCII art banner with CLI name; ANSI Shadow (large width) / ANSI Compact (small); minimal white, gray, black |
| **Version/help** | Lowercase `-v`, `--version`, `-h`, `--help` |
| **Version output** | Version command prints only the version number (no banner, no extra text) |
| **Version source** | Read version from package.json (do not hardcode) |
| **Initial version** | 0.0.1 |
| **Internal flags** | Hide with `.addOption(new Option('--local').hideHelp())` where needed |
| **Publish check** | Run `npx can-i-publish` before build/publish where relevant |
| **Binary name** | Check for existing CLI name conflicts before `pnpm link` / publishing |

---

## Project setup

- **Runtime**: Node 18+, ESM.
- **Version**: Start at `0.0.1` in package.json.
- **Package manager**: pnpm.
- **Build**: tsup (e.g. `tsup src/cli.ts --format esm` or config in `tsup.config.ts`); output to `dist/`; bin entry `docsend-dl` → `dist/cli.js`.
- **Scripts**: `build`, `dev` (tsx src/cli.ts), `test` (vitest). Optionally `prepublishOnly`: run `can-i-publish` then build.
- **Dependencies**: playwright, commander, pdf-lib, ora, picocolors, clack (dev: tsup, vitest, tsx, @types/node). Add `pnpm.onlyBuiltDependencies` in package.json if using native deps (e.g. playwright).
- **Config dir**: `~/.docsend-dl/` for `config.json` and `browser-profile/` (persistent login).

---

## Source layout

```
src/
  cli.ts              # Entry: Commander program, -v/-h, banner, version from package.json, dispatch to commands
  commands/
    download.ts       # download <url> (default command when no subcommand)
    login.ts          # login — open persistent browser for DocSend login
    logout.ts         # logout — clear browser profile
  lib/
    extractor.ts      # Playwright URL extraction → DeckInfo
    downloader.ts     # Parallel image download → DownloadResult
    assembler.ts      # PNGs → single PDF (pdf-lib)
    types.ts          # DeckInfo, DownloadResult, Config, errors
    output.ts         # picocolors + formatError, formatSummary; --json handling
    storage.ts        # getConfigDir, loadConfig, saveConfig, getBrowserProfileDir
```

- **Banner**: Shown on main entry when running default flow (e.g. `docsend-dl <url>` or `docsend-dl download <url>`), not on `-v`/`--version`/`-h`/`--help`. Use terminal width to choose ANSI Shadow (large) vs ANSI Compact (small); colors: minimal white, gray, black. Target ~150px width for the art.
- **Version**: In `cli.ts`, read version from `package.json` (e.g. `import pkg from '../package.json' assert { type: 'json' }` or readFileSync). Version command handler prints only `pkg.version` (no ASCII art, no extra text).

---

## Architecture

- **cli.ts**: Defines program name, description, `.option('-v, --version', ...)`, `.option('-h, --help', ...)`, registers commands from `commands/`, shows banner when running default/download (if not `--json` and not version/help). Exit override for Commander.
- **commands/download.ts**: Implements download (and default URL argument). Uses extractor → downloader → assembler; progress via **ora** spinners; output via **output.ts** (picocolors, --json). Options: `--output`, `--images`, `--no-headless`, `--json`; internal flags hidden with `.hideHelp()` if any.
- **commands/login.ts**: Uses **clack** if needed for prompts; launches persistent context (headed) to DocSend; ora for “Opening browser…”.
- **commands/logout.ts**: Clears `getBrowserProfileDir()`; message with picocolors.
- **lib/output.ts**: Uses **picocolors** for all colored output; `formatError()`, `formatDownloadSummary()`; when `--json`, print only JSON (no banner, no ora spinner text in final output).
- **lib/storage.ts**: `~/.docsend-dl`, config load/save, browser profile path.

---

## CLI surface

- **Default**: `docsend-dl <url>` or `docsend-dl download <url>` — show banner (unless `--json`), then run download with ora spinners.
- **Options (download)**: `--output`, `-o`; `--images`; `--no-headless`; `--json`. Use lowercase where applicable; hide any internal flags.
- **Commands**: `download` (default), `login`, `logout`.
- **Version**: `docsend-dl -v` or `docsend-dl --version` → print only version number (from package.json).
- **Help**: `docsend-dl -h` or `docsend-dl --help`.

---

## Core logic (unchanged from original plan)

- **Extractor**: Same as before — URL regex, Playwright (persistent context if profile exists and not `--no-headless`), in-page JS for slide count/title and batch `page_data` fetch, return `DeckInfo`.
- **Downloader**: Parallel fetch with concurrency and retries; write `slide_01.png`, …; return `DownloadResult`.
- **Assembler**: pdf-lib, one page per PNG, write to output path.

---

## Error handling and output

- All user-facing messages use **picocolors**.
- Progress and “Loading…” states use **ora** (e.g. “Launching browser…”, “Downloading slides…”, “Assembling PDF…”). With `--json`, final stdout is only the JSON result; spinners can still run but final print is JSON only.
- Errors: `formatError(message)`; with `--json` print `{ success: false, error: "..." }` and exit 1.

---

## Testing

- **vitest** for unit tests: URL parsing, downloader retry/semaphore (mocked), assembler with fixture PNGs.
- Optional integration test with public DocSend URL; skip in CI without network if desired.

---

## Pre-publish and naming

- Before build/publish: run `npx can-i-publish` (e.g. in `prepublishOnly`).
- Check for CLI name conflicts before recommending `pnpm link` or publishing (e.g. document in README or script).

---

## Summary

| Area | Choice |
|------|--------|
| Package manager | pnpm |
| Build | tsup |
| Test | vitest |
| CLI | Commander.js; commands in `src/commands/` |
| Interactive | clack |
| Spinners | ora |
| Colors | picocolors |
| Banner | 150px ASCII (ANSI Shadow / ANSI Compact), white/gray/black |
| Version | 0.0.1; from package.json; version command prints only number |
| Flags | -v, --version, -h, --help lowercase; hide internal with .hideHelp() |
| PDF / Login / Config | pdf-lib; persistent browser profile; ~/.docsend-dl |

Use this plan when implementing the CLI so the codebase matches these conventions.
