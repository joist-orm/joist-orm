import { newAuthor } from "src/entities";
import { authorResolvers } from "src/resolvers/objects/author/authorResolvers";
import { makeRunObjectFields } from "src/resolvers/testUtils";

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

const runAuthor = makeRunObjectFields(authorResolvers);
