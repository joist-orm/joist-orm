import { saveAuthorSchedule } from "src/resolvers/authorSchedule/saveAuthorScheduleMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveAuthorSchedule", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveAuthorSchedule);
