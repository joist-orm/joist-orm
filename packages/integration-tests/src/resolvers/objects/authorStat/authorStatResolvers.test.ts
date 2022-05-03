import { newAuthorStat } from "src/entities";
import { authorStatResolvers } from "src/resolvers/objects/authorStat/authorStatResolvers";
import { makeRunResolver, makeRunResolverKeys } from "src/resolvers/testUtils";

describe("authorStatResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Author stat
    const as = newAuthorStat(em);
    // Then we can query it
    const result = await runAuthorStatKeys(ctx, as, ["smallint"]);
    expect(as).toMatchObject(result);
  });
});

const runAuthorStatKeys = makeRunResolverKeys(authorStatResolvers);
const runAuthorStat = makeRunResolver(authorStatResolvers);
