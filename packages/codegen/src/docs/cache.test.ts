import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { DocsCache, getMtime } from "./cache";

describe("DocsCache", () => {
  it("returns not up-to-date for unknown entities", async () => {
    const cache = await DocsCache.load();
    expect(cache.isUpToDate("Unknown", 100, 200)).toBe(false);
  });

  it("returns up-to-date when mtimes match", async () => {
    const cache = await DocsCache.load();
    cache.update("Author", 100, 200);
    expect(cache.isUpToDate("Author", 100, 200)).toBe(true);
  });

  it("returns not up-to-date when ts mtime changed", async () => {
    const cache = await DocsCache.load();
    cache.update("Author", 100, 200);
    expect(cache.isUpToDate("Author", 101, 200)).toBe(false);
  });

  it("returns not up-to-date when md mtime changed", async () => {
    const cache = await DocsCache.load();
    cache.update("Author", 100, 200);
    expect(cache.isUpToDate("Author", 100, 201)).toBe(false);
  });

  it("round-trips through save/load", async () => {
    const cache = await DocsCache.load();
    cache.update("Author", 100, 200);
    cache.update("Book", 300, -1);
    await cache.save();

    const reloaded = await DocsCache.load();
    expect(reloaded.isUpToDate("Author", 100, 200)).toBe(true);
    expect(reloaded.isUpToDate("Book", 300, -1)).toBe(true);
    expect(reloaded.isUpToDate("Unknown", 0, 0)).toBe(false);
  });
});

describe("getMtime", () => {
  it("returns mtimeMs for an existing file", async () => {
    const mtime = await getMtime(__filename);
    expect(mtime).toBeGreaterThan(0);
  });

  it("returns -1 for a missing file", async () => {
    const mtime = await getMtime(join(tmpdir(), "nonexistent-joist-test-file.ts"));
    expect(mtime).toBe(-1);
  });
});
