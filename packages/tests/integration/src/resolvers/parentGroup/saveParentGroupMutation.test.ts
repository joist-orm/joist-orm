import { saveParentGroup } from "src/resolvers/parentGroup/saveParentGroupMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveParentGroup", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveParentGroup);
