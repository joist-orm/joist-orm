import { newAuthorStat } from "src/entities";
import { authorStat } from "src/resolvers/authorStat/authorStatQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("authorStat", () => {
  it.withCtx("returns a Author stat", async (ctx) => {
    const as = newAuthorStat(ctx.em);
    const result = await run(ctx, () => ({ id: as.id }));
    expect(result).toMatchEntity(as);
  });
});

const run = makeRunQuery(authorStat);
