import { saveTaskNew } from "src/resolvers/taskNew/saveTaskNewMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveTaskNew", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveTaskNew);
