import { saveCritic } from "src/resolvers/critic/saveCriticMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe.skip("saveCritic", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveCritic(ctx, () => ({}));
    // const c = await em.load(Critic, result.critic);
  });
});

const runSaveCritic = makeRunInputMutation(saveCritic);
