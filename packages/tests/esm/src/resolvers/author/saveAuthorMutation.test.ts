import { saveAuthor } from "src/resolvers/author/saveAuthorMutation.js";
import { makeRunInputMutation } from "src/resolvers/testUtils.js";

describe("saveAuthor", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({ firstName: "a1" }));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveAuthor);
