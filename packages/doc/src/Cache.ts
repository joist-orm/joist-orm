import fsCache from "file-system-cache";

type HashPair = { sourceHash: string; commentStoreHash: string | undefined };

/**
 * Manages the cache for joist-doc
 *
 * joist-doc cares about two things per integration:
 * - has the source changed
 * - has the commentStore changed
 *
 * Cache holds a manifest document with these values as an object like so:
 * Record<SourcePath, [SourceHash, CommentStoreHash]>
 *
 * If these, match, the previous version of the output can be restored,
 * which is loaded separately under hash(SourcePath)
 */
export class Cache {
  private fsCache = fsCache({
    ns: "joist-doc",
  });

  private manifest: Record<string, [string, string | undefined]>;

  constructor() {
    try {
      this.manifest = JSON.parse(this.fsCache.getSync("manifest"));
    } catch {
      this.manifest = {};
    }
  }

  save() {
    this.fsCache.setSync("manifest", JSON.stringify(this.manifest));
  }

  async set(filePath: string, { sourceHash, commentStoreHash }: HashPair, generated: string) {
    this.manifest[filePath] = [sourceHash, commentStoreHash];
    await this.fsCache.set(filePath, generated);
  }

  async get(filePath: string, hashes: HashPair) {
    const found = this.manifest[filePath];
    if (found && found[0] === hashes.sourceHash && found[1] === hashes.commentStoreHash) {
      const restored = await this.fsCache.get(filePath);
      if (restored) return restored;
    }

    return undefined;
  }
}
