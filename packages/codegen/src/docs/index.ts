import { promises as fs } from "fs";
import { join } from "path";
import { DocsCache, getMtime } from "./cache";
import { getMarkdownFilePath, maybeReadMarkdownFile, updateMarkdownDoc } from "./markdown";
import { applyEdits, buildJSDocEdit, parseEntityJSDocs } from "./parsing";
export { generateMetadataDocsFile } from "./generate-metadata-docs";

/**
 * Run the full docs sync pipeline with mtime-based caching:
 * 1. backfill .md from .ts JSDocs
 * 2. sync .md back into .ts JSDocs
 * 3. save the cache
 */
export async function syncDocs(entitiesDir: string, entityNames: string[]): Promise<void> {
  const cache = await DocsCache.load();

  // Stat all files upfront in parallel to determine which entities need processing
  const stats = await Promise.all(
    entityNames.map(async (entityName) => {
      const tsPath = join(entitiesDir, `${entityName}.ts`);
      const mdPath = getMarkdownFilePath(entitiesDir, entityName);
      const [tsMtime, mdMtime] = await Promise.all([getMtime(tsPath), getMtime(mdPath)]);
      return { entityName, tsPath, mdPath, tsMtime, mdMtime };
    }),
  );

  const dirty = stats.filter((s) => !cache.isUpToDate(s.entityName, s.tsMtime, s.mdMtime));

  if (dirty.length > 0) {
    // Step 1: backfill .md from .ts
    await Promise.all(dirty.map((s) => backfillMarkdownFromJsdoc(s.tsPath, s.mdPath)));

    // Step 2: sync .md into .ts (re-read .md mtimes since backfill may have written them)
    await Promise.all(dirty.map((s) => syncMarkdownToJsdoc(s.entityName, s.tsPath, s.mdPath)));

    // Record final mtimes after both passes
    await Promise.all(
      dirty.map(async (s) => {
        const [tsMtime, mdMtime] = await Promise.all([getMtime(s.tsPath), getMtime(s.mdPath)]);
        cache.update(s.entityName, tsMtime, mdMtime);
      }),
    );
  }

  await cache.save();
}

/** Sync a single entity's Markdown docs into its .ts file. */
async function syncMarkdownToJsdoc(entityName: string, tsPath: string, mdPath: string): Promise<void> {
  const doc = await maybeReadMarkdownFile(mdPath);
  if (!doc || (!doc.overview && Object.keys(doc.fields).length === 0)) return;

  const source = await fs.readFile(tsPath, "utf-8");
  const { classNode, members } = parseEntityJSDocs(source);

  const tag = `@generated ${entityName}.md`;
  const edits = [];
  if (doc.overview && classNode) {
    edits.push(buildJSDocEdit(classNode, `${doc.overview}\n${tag}`));
  }
  for (const [fieldName, fieldDoc] of Object.entries(doc.fields)) {
    if (!fieldDoc) continue;
    for (const member of members.filter((m) => m.name === fieldName && m.kind !== "method")) {
      edits.push(buildJSDocEdit(member.node, `${fieldDoc}\n${tag}`));
    }
  }

  if (edits.length > 0) {
    const updated = applyEdits(source, edits);
    if (updated !== source) {
      await fs.writeFile(tsPath, updated, "utf-8");
    }
  }
}

/**
 * Backfill a single entity's .md file from JSDocs in its .ts file.
 *
 * If the .md doesn't exist, creates it. If it does exist, merges in any
 * fields that are documented in .ts but missing from the .md.
 */
async function backfillMarkdownFromJsdoc(tsPath: string, mdPath: string): Promise<void> {
  const source = await fs.readFile(tsPath, "utf-8");
  const { classDoc, fieldDocs } = parseEntityJSDocs(source);

  if (!classDoc && Object.keys(fieldDocs).length === 0) return;

  const existingDoc = await maybeReadMarkdownFile(mdPath);
  const newFields: Record<string, string> = {};
  for (const [name, doc] of Object.entries(fieldDocs)) {
    if (!existingDoc?.fields[name]) {
      newFields[name] = doc;
    }
  }
  const newOverview = !existingDoc ? classDoc : existingDoc.overview ? undefined : classDoc;

  if (!newOverview && Object.keys(newFields).length === 0) return;

  await updateMarkdownDoc(mdPath, newOverview, newFields);
}
