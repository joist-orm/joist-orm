import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { syncDocs } from "./index";

let testDir: string;

beforeEach(async () => {
  testDir = await fs.mkdtemp(join(tmpdir(), "joist-docs-test-"));
});

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe("syncDocs", () => {
  it("syncs markdown overview into ts file with @generated tag", async () => {
    await fs.writeFile(join(testDir, "Author.ts"), "export class Author extends AuthorCodegen {}", "utf-8");
    await fs.writeFile(join(testDir, "Author.md"), "## Overview\nThe Author entity.\n", "utf-8");

    await syncDocs(testDir, ["Author"]);

    const result = await fs.readFile(join(testDir, "Author.ts"), "utf-8");
    expect(result).toContain("The Author entity.");
    expect(result).toContain("@generated Author.md");
  });

  it("syncs field docs into ts file", async () => {
    const ts = ["export class Author extends AuthorCodegen {", '  readonly firstName: string = "";', "}"].join("\n");
    const md = ["## Overview", "", "## Fields", "", "### firstName", "", "The first name.", ""].join("\n");

    await fs.writeFile(join(testDir, "Author.ts"), ts, "utf-8");
    await fs.writeFile(join(testDir, "Author.md"), md, "utf-8");

    await syncDocs(testDir, ["Author"]);

    const result = await fs.readFile(join(testDir, "Author.ts"), "utf-8");
    expect(result).toContain("The first name.");
    expect(result).toContain("@generated Author.md");
  });

  it("backfills md from ts jsdoc when md does not exist", async () => {
    const ts = ["/** The Author entity. */", "export class Author extends AuthorCodegen {}"].join("\n");
    await fs.writeFile(join(testDir, "Author.ts"), ts, "utf-8");

    await syncDocs(testDir, ["Author"]);

    const md = await fs.readFile(join(testDir, "Author.md"), "utf-8");
    expect(md).toContain("The Author entity.");
  });

  it("skips entities on second run when files are unchanged", async () => {
    const bare = "export class Author extends AuthorCodegen {}";
    await fs.writeFile(join(testDir, "Author.ts"), bare, "utf-8");
    await fs.writeFile(join(testDir, "Author.md"), "## Overview\nThe Author entity.\n", "utf-8");

    // First run — processes, writes JSDoc into .ts, and caches the resulting mtimes
    await syncDocs(testDir, ["Author"]);
    const firstResult = await fs.readFile(join(testDir, "Author.ts"), "utf-8");
    expect(firstResult).toContain("The Author entity.");

    // Snapshot the post-run mtimes (these are what the cache recorded)
    const tsPath = join(testDir, "Author.ts");
    const mdPath = join(testDir, "Author.md");
    const tsStat = await fs.stat(tsPath);
    const mdStat = await fs.stat(mdPath);

    // Revert .ts to the bare version (no JSDoc) but restore the post-run mtime
    // so the cache thinks nothing changed. If syncDocs re-processes, the overview
    // would be re-injected; if it correctly skips, the bare content survives.
    await fs.writeFile(tsPath, bare, "utf-8");
    await fs.utimes(tsPath, tsStat.atimeMs / 1000, tsStat.mtimeMs / 1000);
    await fs.utimes(mdPath, mdStat.atimeMs / 1000, mdStat.mtimeMs / 1000);

    // Second run — should skip because mtimes haven't changed
    await syncDocs(testDir, ["Author"]);
    const secondResult = await fs.readFile(join(testDir, "Author.ts"), "utf-8");

    // If the cache correctly skipped, the bare content is still there (no JSDoc injected)
    expect(secondResult).toBe(bare);
  });

  it("re-processes entity when md file changes", async () => {
    const ts = ["export class Author extends AuthorCodegen {", '  readonly firstName: string = "";', "}"].join("\n");
    await fs.writeFile(join(testDir, "Author.ts"), ts, "utf-8");
    await fs.writeFile(join(testDir, "Author.md"), "## Overview\nVersion one.\n", "utf-8");

    await syncDocs(testDir, ["Author"]);
    const first = await fs.readFile(join(testDir, "Author.ts"), "utf-8");
    expect(first).toContain("Version one.");

    // Wait a tick to ensure mtime differs
    await new Promise((r) => setTimeout(r, 50));

    await fs.writeFile(join(testDir, "Author.md"), "## Overview\nVersion two.\n", "utf-8");
    await syncDocs(testDir, ["Author"]);
    const second = await fs.readFile(join(testDir, "Author.ts"), "utf-8");
    expect(second).toContain("Version two.");
    expect(second).not.toContain("Version one.");
  });

  it("handles entities with no md file", async () => {
    await fs.writeFile(join(testDir, "Author.ts"), "export class Author extends AuthorCodegen {}", "utf-8");

    // Should not throw
    await syncDocs(testDir, ["Author"]);

    // No md created since there's no jsdoc to backfill
    const files = await fs.readdir(testDir);
    expect(files).toMatchObject(["Author.ts"]);
  });
});
