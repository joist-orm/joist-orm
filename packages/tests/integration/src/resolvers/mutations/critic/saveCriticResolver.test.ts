import { saveCritic } from "src/resolvers/mutations/critic/saveCriticResolver";
import { makeRunInputMutation } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe("saveCritic", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveCritic(ctx, () => ({}));
    // const c = await em.load(Critic, result.critic);
  });
});

const runSaveCritic = makeRunInputMutation(saveCritic);
