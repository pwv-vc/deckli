# architecture
- Extract shared constants (e.g. USER_AGENT, token limits) into a dedicated `src/lib/constants.ts` instead of duplicating them across modules. Confidence: 0.85
- Extract repeated inline utility patterns (e.g. file listing filters) into a dedicated `src/lib/fs-utils.ts`. Confidence: 0.80
- Centralize debug logging into a single `src/lib/logger.ts` utility rather than using inconsistent inline patterns across modules. Confidence: 0.80
- Keep cache metadata types, constants, and read/write functions in `src/lib/storage.ts`, not in command files. Confidence: 0.80
- Define shared types like `DownloadOptions` in `src/lib/types.ts` alongside related types, not inline in command files. Confidence: 0.80
- Avoid circular dependencies between lib modules by extracting shared primitives (prompts, utilities) into a neutral module (e.g. `src/lib/markdown-utils.ts`). Confidence: 0.75
