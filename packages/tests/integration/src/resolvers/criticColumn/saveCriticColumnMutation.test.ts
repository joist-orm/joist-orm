import { saveCriticColumn } from "src/resolvers/criticColumn/saveCriticColumnMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveCriticColumn", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveCriticColumn);
