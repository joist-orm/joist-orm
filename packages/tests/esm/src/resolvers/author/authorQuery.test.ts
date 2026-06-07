import { newAuthor } from "src/entities/index.js";
import { author } from "src/resolvers/author/authorQuery.js";
import { makeRunQuery } from "src/resolvers/testUtils.js";

describe("author", () => {
  it.withCtx("returns a Author", async (ctx) => {
    const a = newAuthor(ctx.em);
    const result = await run(ctx, () => ({ id: a.id }));
    expect(result).toMatchEntity(a);
  });
});

const run = makeRunQuery(author);
