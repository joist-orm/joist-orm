import { newCritic } from "src/entities";
import { critic } from "src/resolvers/critic/criticQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("critic", () => {
  it.withCtx("returns a Critic", async (ctx) => {
    const c = newCritic(ctx.em);
    const result = await run(ctx, () => ({ id: c.id }));
    expect(result).toMatchEntity(c);
  });
});

const run = makeRunQuery(critic);
