import { AuthorId, newAuthor } from "src/entities";
import { AuthorResolvers } from "src/generated/graphql-types";
import { authorResolvers } from "src/resolvers/objects/author/authorResolvers";
import { makeRunResolverKeys } from "src/resolvers/testUtils";

describe("authorResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Author
    const a = newAuthor(em);
    // Then we can query it
    const result = await runAuthor(ctx, a, []);
    expect(result).toMatchObject({});
  });
});

const runAuthor = makeRunResolverKeys<AuthorResolvers, AuthorId>(authorResolvers);
