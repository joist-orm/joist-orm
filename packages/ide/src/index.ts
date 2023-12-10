import { loadComments } from "./comments";

async function main() {
  const comments = await loadComments("src/entities/");

  comments.flat().forEach((t) => {
    console.log(Object.values(t).join(" ").split("\n")[0]);
  });
}

main();
