import { newParentGroup } from "src/entities";
import { saveParentItem } from "src/resolvers/parentItem/saveParentItemMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveParentItem", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const parentGroup = newParentGroup(em);
    const result = await runSave(ctx, () => ({ parentGroup: parentGroup.id }));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveParentItem);
