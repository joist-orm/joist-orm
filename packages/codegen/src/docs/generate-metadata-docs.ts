import { code, CodegenFile } from "ts-poet";
import { DbMetadata } from "../EntityDbMetadata";
import { type ParsedDoc } from "./markdown";

/** Creates the `metadata-docs.ts` runtime artifact to access docs. */
export function generateMetadataDocsFile(dbMeta: DbMetadata, docsByEntity: Record<string, ParsedDoc>): CodegenFile {
  const entityEntries = dbMeta.entities.map((meta) => {
    const entityName = meta.entity.name;
    const doc = docsByEntity[entityName];
    const comment = escapeString(doc?.overview ?? "");
    const fieldEntries = Object.entries(doc?.fields ?? {})
      .map(([name, text]) => `${name}: "${escapeString(text)}"`)
      .join(", ");
    return `${entityName}: { comment: "${comment}", fields: { ${fieldEntries} }, operations: undefined }`;
  });

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
