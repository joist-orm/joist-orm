import { promises as fs } from "fs";
import { join } from "path";

export interface ParsedDoc {
  overview: string;
  fields: Record<string, string>;
}

/** Read and parse a .md file if it exists, returning undefined if it doesn't. */
export async function maybeReadMarkdownFile(filePath: string): Promise<ParsedDoc | undefined> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return parseMarkdownContent(content);
  } catch {
    return undefined;
  }
}

/** Reads a basic `overview` and per-field docs out of md content. */
export function parseMarkdownContent(content: string): ParsedDoc {
  const lines = content.split("\n");
  let currentSection: "overview" | "fields" | null = null;
  let currentField: string | null = null;

  const overviewLines: string[] = [];
  const fields: Record<string, string[]> = {};

  for (const line of lines) {
    if (/^## Overview\s*$/.test(line)) {
      currentSection = "overview";
      currentField = null;
      continue;
    }
    if (/^## Fields\s*$/.test(line)) {
      currentSection = "fields";
      currentField = null;
      continue;
    }
    // Any other ## resets us out of known sections
    if (/^## /.test(line)) {
      currentSection = null;
      currentField = null;
      continue;
    }

    if (currentSection === "fields") {
      const fieldMatch = line.match(/^### (\w+)\s*$/);
      if (fieldMatch) {
        currentField = fieldMatch[1];
        fields[currentField] = [];
        continue;
      }
    }

    if (currentSection === "overview") {
      overviewLines.push(line);
    } else if (currentSection === "fields" && currentField) {
      fields[currentField].push(line);
    }
  }

  return {
    overview: trimBlankLines(overviewLines).join("\n"),
    fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, trimBlankLines(v).join("\n")])),
  };
}

/** Create a new .md file from scratch (used only for initial backfill when no .md exists). */
export async function writeMarkdownDoc(
  filePath: string,
  overview: string,
  fields?: Record<string, string>,
): Promise<void> {
  const parts: string[] = [];

  parts.push("## Overview");
  parts.push(overview || "");
  parts.push("");

  if (fields && Object.keys(fields).length > 0) {
    parts.push("## Fields");
    parts.push("");
    for (const [fieldName, fieldDoc] of Object.entries(fields)) {
      parts.push(`### ${fieldName}`);
      parts.push("");
      parts.push(fieldDoc);
      parts.push("");
    }
  }

  await fs.writeFile(filePath, parts.join("\n"), "utf-8");
}

/**
 * Update an existing .md file, merging in new/changed content without stomping user content.
 * If the file doesn't exist, creates it from scratch.
 */
export async function updateMarkdownDoc(
  filePath: string,
  overview: string | undefined,
  fields: Record<string, string>,
): Promise<void> {
  let existing: string | null = null;
  try {
    existing = await fs.readFile(filePath, "utf-8");
  } catch {
    // File doesn't exist
  }

  if (existing !== null) {
    const updated = mergeMarkdownContent(existing, overview, fields);
    if (updated !== existing) {
      await fs.writeFile(filePath, updated, "utf-8");
    }
  } else {
    await writeMarkdownDoc(filePath, overview ?? "", Object.keys(fields).length > 0 ? fields : undefined);
  }
}

export function getMarkdownFilePath(entitiesDir: string, entityName: string): string {
  return join(entitiesDir, `${entityName}.md`);
}

/** Trim leading/trailing blank lines but preserve internal blank lines. */
function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  while (start < lines.length && lines[start].trim() === "") start++;
  let end = lines.length - 1;
  while (end >= start && lines[end].trim() === "") end--;
  return lines.slice(start, end + 1);
}

/**
 * Merge updates into an existing .md file, preserving all user content.
 *
 * - If `overview` is provided and the file has `## Overview`, replaces its body
 * - For each field in `fields`, if `### fieldName` exists, replaces its body;
 *   otherwise appends it to the `## Fields` section (creating the section if needed)
 * - All other content (custom sections, tables, etc.) is preserved verbatim
 */
function mergeMarkdownContent(existing: string, overview: string | undefined, fields: Record<string, string>): string {
  const lines = existing.split("\n");
  const result: string[] = [];

  // Track which fields we've already merged so we know what to append
  const mergedFields = new Set<string>();
  let fieldsEndIndex = -1;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Replace ## Overview body
    if (/^## Overview\s*$/.test(line) && overview !== undefined) {
      result.push(line);
      i++;
      // Skip over old overview body (until next ## or EOF)
      while (i < lines.length && !/^## /.test(lines[i])) i++;
      // Write new overview body
      result.push(overview || "");
      result.push("");
      continue;
    }

    // Track where ## Fields section ends (for appending new fields)
    if (/^## Fields\s*$/.test(line)) {
      result.push(line);
      i++;
      // Process the fields section line by line
      while (i < lines.length && !/^## /.test(lines[i])) {
        const fieldMatch = lines[i].match(/^### (\w+)\s*$/);
        if (fieldMatch && fieldMatch[1] in fields) {
          const fieldName = fieldMatch[1];
          mergedFields.add(fieldName);
          result.push(lines[i]); // ### fieldName
          i++;
          // Skip old field body (until next ### or ## or EOF)
          while (i < lines.length && !/^###? /.test(lines[i]) && !/^## /.test(lines[i])) i++;
          // Write new field body
          result.push("");
          result.push(fields[fieldName]);
          result.push("");
        } else {
          // Keep any line that isn't a field we're replacing (other ### fields, blank lines, etc.)
          result.push(lines[i]);
          i++;
        }
      }
      fieldsEndIndex = result.length;
      continue;
    }

    result.push(line);
    i++;
  }

  // Append any fields that weren't already in the file
  const newFields = Object.entries(fields).filter(([name]) => !mergedFields.has(name));
  if (newFields.length > 0) {
    if (fieldsEndIndex === -1) {
      // No ## Fields section existed, create one
      result.push("");
      result.push("## Fields");
      result.push("");
      fieldsEndIndex = result.length;
    }
    const toInsert: string[] = [];
    for (const [fieldName, fieldDoc] of newFields) {
      toInsert.push(`### ${fieldName}`);
      toInsert.push("");
      toInsert.push(fieldDoc);
      toInsert.push("");
    }
    result.splice(fieldsEndIndex, 0, ...toInsert);
  }

  return result.join("\n");
}

export const testing = { mergeMarkdownContent };
