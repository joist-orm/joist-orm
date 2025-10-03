import { saveTask } from "src/resolvers/task/saveTaskMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveTask", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveTask);
