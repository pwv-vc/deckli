# Code audit: CLI taste compliance

Audit against [.commandcode/taste/taste.md](taste.md) → [cli/taste.md](cli/taste.md).

| Rule | Status | Notes |
|------|--------|--------|
| Use pnpm as package manager | ✅ | `pnpm-lock.yaml` present; `prepublishOnly`: `pnpm run build` |
| Use TypeScript for CLI | ✅ | `src/**/*.ts`, `tsconfig`, `tsup` |
| Use tsup as build tool | ✅ | `package.json` scripts + `tsup.config.ts` |
| Use vitest for testing | ✅ | `"test": "vitest"`, devDependency |
| Use Commander.js for CLI | ✅ | `commander` in deps; `src/cli.ts` + `src/commands/*.ts` |
| Use clack for interactive input | ⚠️ Partial | Login uses `readline` + `ora`; no clack. Optional to adopt clack for prompts. |
| Check CLI name conflicts before npm link | ❌ | No script or doc step; optional. |
| Commands in dedicated folder, one module per command | ✅ | `src/commands/` with `download.ts`, `login.ts`, `logout.ts` |
| 150px ASCII art welcome banner with CLI name | ✅ | `src/banner.ts`: ANSI Shadow (wide) + Compact (narrow), shows "deckli" |
| Lowercase -v, --version, -h, --help | ✅ | `.version(version, "-v, --version", ...)`, `.helpOption("-h, --help", ...)` |
| Start with version 0.0.1 | ✅ | `package.json` `"version": "0.0.1"` |
| Version command outputs only version number | ✅ | `-v`/`--version` path: `console.log(version)` then exit (no banner) |
| Read CLI version from package.json | ✅ | `cli.ts` reads `pkg.version` from `package.json` |
| Always use ora for loading spinners | ✅ | `ora` used in `download.ts`, `login.ts` |
| Use picocolors for terminal coloring | ✅ | `picocolors` in deps; used in `output.ts`, `banner.ts`, `login.ts`, `logout.ts` |
| Hide internal flags from help | ✅ | No internal-only flags; all options are user-facing. |
| pnpm.onlyBuiltDependencies | ✅ | `"pnpm": { "onlyBuiltDependencies": ["playwright"] }` |
| ANSI Shadow (large width) / ANSI Compact (small) for banner | ✅ | `getBanner()` uses `cols >= 72` → wide, else narrow |
| Minimal white, gray, black for ASCII art | ✅ | `pc.white()`, `pc.gray()` only in `banner.ts` |
| can-i-publish before build/publish | ❌ | Not in `prepublishOnly` or docs; optional. |

**Summary:** All high-confidence rules (pnpm, TypeScript, tsup, vitest, Commander, ora, picocolors, version from package.json, version output only, banner, commands folder, onlyBuiltDependencies) are satisfied. Optional / lower-priority: clack for interactive prompts, npm link conflict check, can-i-publish in release flow.
