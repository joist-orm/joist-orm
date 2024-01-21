import { newAuthor } from "src/entities";
import { authorResolvers } from "src/resolvers/objects/author/authorResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("authorResolvers", () => {
  it.withCtx("can test multiple fields", async (ctx) => {
    const { em } = ctx;
    // Given an Author
    const a = newAuthor(em);
    // Then we can query it
    const result = await runFields(ctx, a, ["firstName", "lastName"]);
    expect(result).toMatchObject({});
  });

  it.withCtx("can test a single custom field", async (ctx) => {
    const { em } = ctx;
    // Given an Author
    const a = newAuthor(em);
    // Then we can query it
    const result = await runField(ctx, a, "graphqlOnlyField", 1);
    expect(result).toBe(3);
  });
});

const runFields = makeRunObjectFields(authorResolvers);
const runField = makeRunObjectField(authorResolvers);
