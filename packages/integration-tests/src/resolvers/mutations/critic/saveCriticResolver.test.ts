import { Context } from "src/context";
import { SaveCriticInput } from "src/generated/graphql-types";
import { saveCritic } from "src/resolvers/mutations/critic/saveCriticResolver";
import { run } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe("saveCritic", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveCritic(ctx, () => ({}));
    // const c = await em.load(Critic, result.critic);
  });
});

async function runSaveCritic(ctx: Context, inputFn: () => SaveCriticInput) {
  return await run(ctx, async (ctx) => {
    return saveCritic.saveCritic({}, { input: inputFn() }, ctx, undefined!);
  });
}
