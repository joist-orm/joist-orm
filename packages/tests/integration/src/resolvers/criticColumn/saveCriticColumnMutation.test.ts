import { newCritic } from "src/entities";
import { saveCriticColumn } from "src/resolvers/criticColumn/saveCriticColumnMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveCriticColumn", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const critic = newCritic(em);
    const result = await runSave(ctx, () => ({ name: "cc1", critic: critic.id }));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveCriticColumn);
