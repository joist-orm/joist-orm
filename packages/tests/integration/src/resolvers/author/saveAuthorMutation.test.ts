import { saveAuthor } from "src/resolvers/author/saveAuthorMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveAuthor", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveAuthor);
