import { EntityMetadata } from "joist-orm";
import path from "path";
import { HookComment, loadComments } from "./comments";

async function main() {
  const { allMetadata } = require(path.resolve("src/entities")) as { allMetadata: EntityMetadata[] };
  // console.log(allMetadata);

  const comments = await loadComments("src/entities/");
  const hookComments: Record<string, HookComment> = {};
  comments.forEach((c) => {
    if (c.kind === "hook") {
      hookComments[`${c.entity}:${c.lineNumber}`] = c;
    }
  });

  allMetadata.forEach((m) => {
    console.log(`${m.cstr.name} - ${Object.values(m.config.__data.hooks).flat().length} hooks`);
    Object.entries(m.config.__data.hooks).forEach(([hook, fns]) => {
      if (fns.length > 0) {
        console.log(`  ${hook}: ${fns.length}`);
        fns.forEach((fn) => {
          console.log(`    ${fn.callerName}`);
          console.log(`      ${hookComments[fn.callerName]?.comment.trim()}`);
          console.log(`      ${JSON.stringify(fn.hint)}`);
        });
      }
    });
    console.log("");
  });
}

main();
