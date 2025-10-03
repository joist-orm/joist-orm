import { saveBook } from "src/resolvers/book/saveBookMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveBook", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveBook);
