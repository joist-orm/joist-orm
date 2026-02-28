import { code, CodegenFile } from "ts-poet";
import { Config } from "../config";
import { DbMetadata } from "../EntityDbMetadata";
import { maybeReadMarkdownFile } from "./markdown";

/** Creates the `metadata-docs.ts` runtime artifact to access docs. */
export async function generateMetadataDocsFile(config: Config, dbMeta: DbMetadata): Promise<CodegenFile> {
  const { entities } = dbMeta;

  const entityEntries = await Promise.all(
    entities.map(async (meta) => {
      const entityName = meta.entity.name;
      const mdPath = `${config.entitiesDirectory}/${entityName}.md`;
      const doc = await maybeReadMarkdownFile(mdPath);
      const comment = escapeString(doc?.overview ?? "");
      const fieldEntries = Object.entries(doc?.fields ?? {})
        .map(([name, text]) => `${name}: "${escapeString(text)}"`)
        .join(", ");
      return `${entityName}: { comment: "${comment}", fields: { ${fieldEntries} }, operations: undefined }`;
    }),
  );

  const body = entityEntries.map((e) => `  ${e},`).join("\n");

  return {
    name: "./codegen/metadata-docs.ts",
    contents: code`
      export const docs = {
      ${body}
      } as const;

      export type EntityDocs = typeof docs;
    `,
    overwrite: true,
  };
}

/** Escape a string for use inside a JS string literal (double-quoted). */
function escapeString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
