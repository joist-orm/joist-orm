import { newAuthor } from "src/entities/index.js";
import { saveBook } from "src/resolvers/book/saveBookMutation.js";
import { makeRunInputMutation } from "src/resolvers/testUtils.js";

describe("saveBook", () => {
  it.withCtx("can create", async (ctx) => {
    const a1 = newAuthor(ctx.em);
    const result = await runSave(ctx, () => ({ title: "b1", author: a1 }));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveBook);
