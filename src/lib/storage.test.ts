import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import {
  getBrowserProfileDir,
  getSlideCacheDir,
  hasBrowserProfile,
  clearBrowserProfile,
  listProfileKeys,
  resolvePdfPath,
} from "./storage.js";

describe("storage (with DECKLI_HOME)", () => {
  let testHome: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    testHome = join(tmpdir(), `deckli-test-${randomBytes(8).toString("hex")}`);
    mkdirSync(testHome, { recursive: true });
    originalEnv = process.env.DECKLI_HOME;
    process.env.DECKLI_HOME = testHome;
  });

  afterEach(() => {
    if (originalEnv !== undefined) process.env.DECKLI_HOME = originalEnv;
    else delete process.env.DECKLI_HOME;
    if (existsSync(testHome)) {
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  it("getBrowserProfileDir returns different paths for different keys", () => {
    const dir1 = getBrowserProfileDir("abc123");
    const dir2 = getBrowserProfileDir("v-MySpace-deck");
    expect(dir1).toContain("abc123");
    expect(dir2).toContain("v-MySpace-deck");
    expect(dir1).not.toBe(dir2);
  });

  it("getBrowserProfileDir sanitizes profile key", () => {
    const dir = getBrowserProfileDir("key/with\\special.chars");
    expect(dir).toContain("key_with_special_chars");
    expect(dir).not.toMatch(/key\/with/);
    expect(dir).not.toMatch(/special\.chars/);
  });

  it("getSlideCacheDir returns path under config with cache and sanitized slug", () => {
    const dir = getSlideCacheDir("docsend-abc123");
    expect(dir).toContain("cache");
    expect(dir).toContain("docsend-abc123");
    expect(dir).toContain(testHome);
  });

  it("hasBrowserProfile returns false when profile dir does not exist", () => {
    expect(hasBrowserProfile("nonexistent")).toBe(false);
  });

  it("hasBrowserProfile returns true after creating profile dir", () => {
    const dir = getBrowserProfileDir("mykey");
    mkdirSync(dir, { recursive: true });
    expect(hasBrowserProfile("mykey")).toBe(true);
  });

  it("clearBrowserProfile removes profile dir for given key", () => {
    const dir = getBrowserProfileDir("toclear");
    mkdirSync(dir, { recursive: true });
    expect(hasBrowserProfile("toclear")).toBe(true);
    clearBrowserProfile("toclear");
    expect(hasBrowserProfile("toclear")).toBe(false);
  });

  it("listProfileKeys returns empty when no profiles", () => {
    expect(listProfileKeys()).toEqual([]);
  });

  it("listProfileKeys returns keys after creating profile dirs", () => {
    mkdirSync(getBrowserProfileDir("key1"), { recursive: true });
    mkdirSync(getBrowserProfileDir("key2"), { recursive: true });
    const keys = listProfileKeys();
    expect(keys).toContain("key1");
    expect(keys).toContain("key2");
    expect(keys.length).toBe(2);
  });

  it("clearBrowserProfile() with no arg clears all profiles", () => {
    mkdirSync(getBrowserProfileDir("a"), { recursive: true });
    mkdirSync(getBrowserProfileDir("b"), { recursive: true });
    clearBrowserProfile();
    expect(listProfileKeys()).toEqual([]);
  });
});

describe("resolvePdfPath", () => {
  const cwd = "/tmp/cwd";

  it("returns cwd/deckTitle.pdf when output is undefined", () => {
    expect(resolvePdfPath(undefined, "My Deck", cwd)).toBe(join(cwd, "My Deck.pdf"));
  });

  it("returns output as path when output ends with .pdf", () => {
    expect(resolvePdfPath("out.pdf", "Deck", cwd)).toBe(join(cwd, "out.pdf"));
    expect(resolvePdfPath("/absolute/out.pdf", "Deck", cwd)).toBe("/absolute/out.pdf");
  });

  it("returns output/deckTitle.pdf when output is a directory", () => {
    expect(resolvePdfPath("/absolute/dir", "Deck", cwd)).toBe("/absolute/dir/Deck.pdf");
    expect(resolvePdfPath("relative/dir", "Deck", cwd)).toBe(join(cwd, "relative/dir/Deck.pdf"));
  });
});
