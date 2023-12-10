import { EntityMetadata } from "joist-orm";
import path from "path";
import { loadComments } from "./comments";

async function main() {
  const { allMetadata } = require(path.resolve("src/entities")) as { allMetadata: EntityMetadata[] };
  console.log(allMetadata);

  async function two() {
    const comments = await loadComments("src/entities/");
    comments.flat().forEach((t) => {
      console.log(Object.values(t).join(" ").split("\n")[0]);
    });
  }
}

main();
