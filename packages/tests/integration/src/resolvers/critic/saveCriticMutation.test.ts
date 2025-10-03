import { saveCritic } from "src/resolvers/critic/saveCriticMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveCritic", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveCritic);
