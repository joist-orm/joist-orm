import { saveTag } from "src/resolvers/tag/saveTagMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveTag", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveTag);
