import { saveTaskOld } from "src/resolvers/taskOld/saveTaskOldMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveTaskOld", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({ specialOldField: 1 }));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveTaskOld);
