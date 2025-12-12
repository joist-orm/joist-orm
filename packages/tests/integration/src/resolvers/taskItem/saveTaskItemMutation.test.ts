import { saveTaskItem } from "src/resolvers/taskItem/saveTaskItemMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveTaskItem", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveTaskItem);
