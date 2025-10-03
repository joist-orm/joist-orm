import { saveAuthorStat } from "src/resolvers/authorStat/saveAuthorStatMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveAuthorStat", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveAuthorStat);
