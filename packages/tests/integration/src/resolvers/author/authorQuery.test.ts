import { newAuthor } from "src/entities";
import { author } from "src/resolvers/author/authorQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("author", () => {
  it.withCtx("returns a Author", async (ctx) => {
    const a = newAuthor(ctx.em);
    const result = await run(ctx, () => ({ id: a.id }));
    expect(result).toMatchEntity(a);
  });
});

const run = makeRunQuery(author);
