import { newCriticColumn } from "src/entities";
import { criticColumn } from "src/resolvers/criticColumn/criticColumnQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("criticColumn", () => {
  it.withCtx("returns a Critic column", async (ctx) => {
    const cc = newCriticColumn(ctx.em);
    const result = await run(ctx, () => ({ id: cc.id }));
    expect(result).toMatchEntity(cc);
  });
});

const run = makeRunQuery(criticColumn);
