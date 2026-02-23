import { newChild, newParentGroup } from "src/entities";
import { saveChildGroup } from "src/resolvers/childGroup/saveChildGroupMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveChildGroup", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const child = newChild(em);
    const parentGroup = newParentGroup(em);
    const result = await runSave(ctx, () => ({ childGroup: child.id, parentGroup: parentGroup.id }));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveChildGroup);
