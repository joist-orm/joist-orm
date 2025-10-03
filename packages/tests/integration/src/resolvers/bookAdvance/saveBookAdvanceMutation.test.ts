import { saveBookAdvance } from "src/resolvers/bookAdvance/saveBookAdvanceMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveBookAdvance", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveBookAdvance);
