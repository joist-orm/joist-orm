import type { namedTypes } from "ast-types";
import jscodeshift, { ASTNode } from "jscodeshift";

const j = jscodeshift.withParser("ts");

type CommentKind = (namedTypes.CommentBlock | namedTypes.CommentLine | namedTypes.Block | namedTypes.Line) & {
  start?: number;
  end?: number;
};
j;
type Commented = ASTNode & {
  comments?: CommentKind[] | null;
  start?: number;
  end?: number;
  loc?: namedTypes.SourceLocation | null;
};

export type MemberKind = "property" | "getter" | "setter" | "method";

export interface MemberInfo {
  kind: MemberKind;
  name: string;
  doc: string | undefined;
  node: Commented;
}

export interface SourceEdit {
  start: number;
  end: number;
  text: string;
}

/** Parse an entity .ts file and extract class + member JSDoc. */
export function parseEntityJSDocs(source: string) {
  const root = j(source);
  let classDoc: string | undefined;
  let classNode: Commented | undefined;
  const members: MemberInfo[] = [];

  root.find(j.ExportNamedDeclaration).forEach((p) => {
    if (p.node.declaration?.type === "ClassDeclaration") {
      classDoc = extractJSDoc(p.node as Commented);
      classNode = p.node as Commented;
    }
  });

  root.find(j.ClassProperty).forEach((p) => {
    const name = (p.node.key as namedTypes.Identifier)?.name;
    if (name) {
      members.push({ name, kind: "property", doc: extractJSDoc(p.node as Commented), node: p.node as Commented });
    }
  });

  root.find(j.ClassMethod).forEach((p) => {
    const name = (p.node.key as namedTypes.Identifier)?.name;
    if (name) {
      members.push({
        name,
        kind: classMethodKind(p.node),
        doc: extractJSDoc(p.node as Commented),
        node: p.node as Commented,
      });
    }
  });

  return { classDoc, classNode, members, fieldDocs: collectFieldDocs(members) };
}

/**
 * Collect field docs from members for backfill.
 * When a getter and setter share the same name, prefer the getter's doc.
 */
function collectFieldDocs(members: MemberInfo[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const m of members) {
    if (!m.doc || m.kind === "method") continue;
    if (result[m.name] && m.kind === "setter") continue;
    result[m.name] = m.doc;
  }
  return result;
}

/**
 * Build a source edit that sets the JSDoc on a node (replacing existing or inserting new).
 *
 * (This is bizarre, but this `SourceEdit` + `applyEdits` leaves all existing formatting
 * alone better than doing a `node.toSource()` or other AST-based updates. :grimmacing:)
 */
export function buildJSDocEdit(node: Commented, text: string): SourceEdit {
  const column = node.loc!.start.column;
  const existingComment = node.comments?.find((c) => c.leading && "value" in c && c.value.startsWith("*"));
  if (existingComment) {
    return { start: existingComment.start!, end: existingComment.end!, text: buildJSDocBlock(text, column) };
  }
  const indent = " ".repeat(column);
  return { start: node.start!, end: node.start!, text: buildJSDocBlock(text, column) + "\n" + indent };
}

/** Apply edits to source by splicing in reverse order. */
export function applyEdits(source: string, edits: SourceEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let result = source;
  for (const edit of sorted) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

/** Build a JSDoc block comment string from plain text. */
function buildJSDocBlock(text: string, indent: number): string {
  const pad = " ".repeat(indent);
  const lines = text.split("\n");
  if (lines.length === 1) return `/** ${lines[0]} */`;
  return `/**\n` + lines.map((l) => (l ? `${pad} * ${l}` : `${pad} *`)).join("\n") + `\n${pad} */`;
}

/** Extract text from a JSDoc-style leading block comment (i.e. one starting with `*`). */
function extractJSDoc(node: Commented): string | undefined {
  const block = node.comments?.find((c) => c.leading && "value" in c && c.value.startsWith("*"));
  if (!block || !("value" in block)) return undefined;
  const lines = block.value.split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trimEnd());
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.join("\n") || undefined;
}

function classMethodKind(node: namedTypes.ClassMethod): MemberKind {
  if (node.kind === "get") return "getter";
  if (node.kind === "set") return "setter";
  return "method";
}
