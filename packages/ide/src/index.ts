import { parse, ParseResult } from "@babel/parser";
import traverse from "@babel/traverse";
import { Dirent } from "fs";
import { readdir, readFile } from "fs/promises";

async function main() {
  const files = await getFiles("src/entities/");
  console.log(`Found ${files.length} files`);

  const hookComments = await Promise.all(
    files.map(async (file) => {
      const fileContents = await readFile(`${file.path}/${file.name}`, { encoding: "utf-8" });
      try {
        const source = parse(fileContents, { sourceType: "module", plugins: ["typescript"] });
        return getHookComments(file.name, source);
      } catch (e: any) {
        return [[0, `${file.name} ${e.message}`]];
      }
    }),
  );

  hookComments.flat().forEach((t) => {
    console.log(t.join(" ").split("\n")[0]);
  });
}

const hooks = ["beforeFlush", "beforeCreate", "beforeUpdate", "beforeDelete", "afterValidation"];

function getHookComments(name: string, source: ParseResult<any>): [string, string, number, string][] {
  const comments: [string, string, number, string][] = [];
  traverse(source, {
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
          comments.push([name, hook, exp.loc!.start.line, path.node.leadingComments[0].value]);
        }
      }
    },
  });
  return comments;
}

async function getFiles(dirPath: string): Promise<Dirent[]> {
  const entries = await readdir(dirPath, { withFileTypes: true, recursive: false });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .filter((e) => !e.name.includes("factories") && !e.name.includes("Codegen") && !e.name.includes(".test.ts"));
}

main();
