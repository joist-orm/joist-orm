import { newChildGroup, newParentGroup, newParentItem } from "src/entities";
import { saveChildItem } from "src/resolvers/childItem/saveChildItemMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveChildItem", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const parentGroup = newParentGroup(em);
    const childGroup = newChildGroup(em, { parentGroup });
    const parentItem = newParentItem(em, { parentGroup });
    const result = await runSave(ctx, () => ({ childGroup: childGroup.id, parentItem: parentItem.id }));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveChildItem);
