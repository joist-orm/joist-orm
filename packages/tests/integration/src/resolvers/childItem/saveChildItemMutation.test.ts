import { saveChildItem } from "src/resolvers/childItem/saveChildItemMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveChildItem", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveChildItem);
