import { saveParentItem } from "src/resolvers/parentItem/saveParentItemMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveParentItem", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveParentItem);
