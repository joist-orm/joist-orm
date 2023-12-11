import { parse, ParseResult } from "@babel/parser";
import traverse from "@babel/traverse";
import { File } from "@babel/types";
import { Dirent } from "fs";
import { readdir, readFile } from "fs/promises";

export interface FieldComment {
  kind: "field";
  entity: string;
  field: string;
  comment: string;
}

export interface HookComment {
  kind: "hook";
  entity: string;
  hook: string;
  lineNumber: number | undefined;
  comment: string;
}

export interface ClassComment {
  kind: "class";
  entity: string;
  comment: string;
}

type Comment = FieldComment | HookComment | ClassComment;

/** Uses babel to load the jsdoc comments from the entity `*.ts` files. */
export async function loadComments(dirPath: string): Promise<Comment[]> {
  const files = await getFilesToParse(dirPath);
  // console.log(`Found ${files.length} files`);
  const comments = await Promise.all(
    files.map(async (file) => {
      const fileContents = await readFile(`${file.path}/${file.name}`, { encoding: "utf-8" });
      try {
        const source = parse(fileContents, { sourceType: "module", plugins: ["typescript"] });
        return findComments(file.name, source);
      } catch (e: any) {
        return [];
      }
    }),
  );
  return comments.flat();
}

const hooks = ["beforeFlush", "beforeCreate", "beforeUpdate", "beforeDelete", "afterValidation"];

function findComments(entity: string, source: ParseResult<File>): Comment[] {
  const comments: Comment[] = [];
  traverse(source, {
    // Look for class jsdocs
    ClassDeclaration(path) {
      // For some reason `path.node.leadingComments` is also empty, so find it ourselves
      const lineStart = path.node.loc?.start.line;
      const found = lineStart && source.comments?.find((c) => c.loc?.end.line === lineStart - 1);
      if (found) {
        comments.push({ kind: "class", entity, comment: found.value });
      }
    },

    // Look for field docs i.e. on relations & async methods
    ClassProperty(path) {
      if (path.node.key.type === "Identifier") {
        const field = path.node.key.name;
        if (path.node.leadingComments && path.node.leadingComments.length > 0) {
          comments.push({ kind: "field", entity, field, comment: path.node.leadingComments[0].value });
        }
      }
    },

    // Look for `config.beforeFlush` hook calls
    ExpressionStatement(path) {
      const exp = path.node.expression;
      if (
        exp.type === "CallExpression" &&
        exp.callee.type === "MemberExpression" &&
        exp.callee.object.type === "Identifier" &&
        exp.callee.object.name === "config" &&
        exp.callee.property.type === "Identifier" &&
        hooks.includes(exp.callee.property.name)
      ) {
        const hook = exp.callee.property.name;
        if (path.node.leadingComments && path.node.leadingComments.length > 0) {
          comments.push({
            kind: "hook",
            entity,
            hook,
            lineNumber: exp.loc!.start.line,
            comment: path.node.leadingComments[0].value,
          });
        }
      }
    },
  });
  return comments;
}

/** Looks in the `src/entities` directory but ignores tests, factories, and codegen files. */
async function getFilesToParse(dirPath: string): Promise<Dirent[]> {
  const entries = await readdir(dirPath, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .filter(
      (e) =>
        !e.name.endsWith("factories.ts") &&
        !e.name.endsWith("Codegen.ts") &&
        !e.name.endsWith(".test.ts") &&
        e.name !== "entities.ts" &&
        e.name !== "metadata.ts",
    );
}
