import { saveBook } from "src/resolvers/book/saveBookMutation.js";
import { makeRunInputMutation } from "src/resolvers/testUtils.js";

describe("saveBook", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveBook);
