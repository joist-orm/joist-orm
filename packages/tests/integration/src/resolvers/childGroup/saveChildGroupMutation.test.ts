import { saveChildGroup } from "src/resolvers/childGroup/saveChildGroupMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveChildGroup", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveChildGroup);
