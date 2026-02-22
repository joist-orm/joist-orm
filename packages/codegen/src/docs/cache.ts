import { createHash } from "crypto";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const CACHE_VERSION = 1;
const CACHE_DIR = join(tmpdir(), "joist-codegen-cache");

/** A tuple of .ts and .md mtimes for an entity, used for caching. */
interface CacheEntry {
  tsMtime: number;
  mdMtime: number; // -1 when .md doesn't exist
}

/** The shape of the JSON file we write to disk for caching per-entity file modification times. */
interface CacheFile {
  version: number;
  entities: Record<string, CacheEntry>;
}

/** A simple mtime-based cache for docs syncing, to skip processing when neither .ts nor .md has changed. */
export class DocsCache {
  #entries: Record<string, CacheEntry>;
  #cachePath: string;

  private constructor(cachePath: string, entries: Record<string, CacheEntry>) {
    this.#cachePath = cachePath;
    this.#entries = entries;
  }

  static async load(): Promise<DocsCache> {
    const cachePath = getCachePath();
    try {
      const raw = JSON.parse(await fs.readFile(cachePath, "utf-8")) as CacheFile;
      if (raw.version === CACHE_VERSION) {
        return new DocsCache(cachePath, raw.entities);
      }
    } catch {
      // Missing or corrupt — start fresh
    }
    return new DocsCache(cachePath, {});
  }

  /** Returns true if both file mtimes match the cached values (i.e. skip processing). */
  isUpToDate(entityName: string, tsMtime: number, mdMtime: number): boolean {
    const cached = this.#entries[entityName];
    return !!cached && cached.tsMtime === Math.floor(tsMtime) && cached.mdMtime === Math.floor(mdMtime);
  }

  /** Record the current mtimes for an entity after processing it. */
  update(entityName: string, tsMtime: number, mdMtime: number): void {
    this.#entries[entityName] = { tsMtime: Math.floor(tsMtime), mdMtime: Math.floor(mdMtime) };
  }

  async save(): Promise<void> {
    const data: CacheFile = { version: CACHE_VERSION, entities: this.#entries };
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(this.#cachePath, JSON.stringify(data), "utf-8");
  }
}

/** Stat a file and return its mtimeMs, or -1 if it doesn't exist. */
export async function getMtime(filePath: string): Promise<number> {
  try {
    return (await fs.stat(filePath)).mtimeMs;
  } catch {
    return -1;
  }
}

function getCachePath(): string {
  const hash = createHash("sha256").update(process.cwd()).digest("hex").slice(0, 16);
  return join(CACHE_DIR, `${hash}.json`);
}
