import { newAuthor } from "src/entities/index.js";
import { authorResolvers } from "src/resolvers/author/authorResolvers.js";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils.js";

describe("authorResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Author
    const a = newAuthor(em);
    // Then we can query it
    const result = await runFields(ctx, a, ["firstName", "lastName", "delete", "createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(authorResolvers);
const runField = makeRunObjectField(authorResolvers);
