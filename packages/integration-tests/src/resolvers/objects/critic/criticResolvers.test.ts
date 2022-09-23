import { newCritic } from "src/entities";
import { criticResolvers } from "src/resolvers/objects/critic/criticResolvers";
import { makeRunObjectFields } from "src/resolvers/testUtils";

describe("criticResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Critic
    const c = newCritic(em);
    // Then we can query it
    const result = await runCritic(ctx, c, []);
    expect(result).toMatchObject({});
  });
});

const runCritic = makeRunObjectFields(criticResolvers);
