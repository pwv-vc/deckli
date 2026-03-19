import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, isAbsolute } from "path";
import type { Config } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

const CONFIG_DIR_NAME = ".deckli";
const PROFILES_DIR_NAME = "profiles";
const CACHE_DIR_NAME = "cache";
const CONFIG_FILE_NAME = "config.json";

function getConfigDir(): string {
  const base = process.env.DECKLI_HOME ?? homedir();
  const dir = join(base, CONFIG_DIR_NAME);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getProfilesDir(): string {
  const dir = join(getConfigDir(), PROFILES_DIR_NAME);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getConfigPath(): string {
  return join(getConfigDir(), CONFIG_FILE_NAME);
}

/** Browser profile dir for a given profile key (per-deck slug or v-space-name). */
export function getBrowserProfileDir(profileKey: string): string {
  const safeKey = profileKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(getProfilesDir(), safeKey);
}

/** Cache dir for slide images for a deck (by slug). Used for PDF path to skip re-download when not --force. */
export function getSlideCacheDir(slug: string): string {
  const safeSlug = slug.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(getConfigDir(), CACHE_DIR_NAME, safeSlug);
}

export function loadConfig(): Config {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const data = readFileSync(path, "utf-8");
    const loaded = JSON.parse(data) as Partial<Config>;
    return { ...DEFAULT_CONFIG, ...loaded };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: Config): void {
  const path = getConfigPath();
  writeFileSync(path, JSON.stringify(config, null, 2), "utf-8");
}

export function hasBrowserProfile(profileKey: string): boolean {
  const dir = getBrowserProfileDir(profileKey);
  return existsSync(dir);
}

export function clearBrowserProfile(profileKey?: string): void {
  if (profileKey !== undefined) {
    const dir = getBrowserProfileDir(profileKey);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
    return;
  }
  const profilesDir = getProfilesDir();
  if (existsSync(profilesDir)) {
    rmSync(profilesDir, { recursive: true, force: true });
  }
}

/** List all profile keys that have a saved browser profile. */
export function listProfileKeys(): string[] {
  const profilesDir = getProfilesDir();
  if (!existsSync(profilesDir)) return [];
  return readdirSync(profilesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

/** Sanitize a deck slug or title for use as a single path segment (same rules as slide cache dirs). */
export function sanitizeDeckDirName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Parent directory that contains per-deck slug folders.
 * `-o` omitted → `cwd`. `-o` ending in `.pdf` → `dirname` of that path. Otherwise `-o` is the parent dir.
 */
export function resolveParentOutput(output: string | undefined, cwd: string): string {
  if (output === undefined || output === "") {
    return cwd;
  }
  const abs = isAbsolute(output) ? output : join(cwd, output);
  if (output.toLowerCase().endsWith(".pdf")) {
    return dirname(abs);
  }
  return abs;
}

/** Full path to a deck folder: `parentOutput/<sanitized slug or title>`. */
export function resolveDeckDir(parentOutput: string, slugOrTitle: string): string {
  return join(parentOutput, sanitizeDeckDirName(slugOrTitle));
}
