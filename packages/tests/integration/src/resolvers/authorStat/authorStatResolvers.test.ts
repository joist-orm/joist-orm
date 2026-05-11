import { newAuthorStat } from "src/entities";
import { authorStatResolvers } from "src/resolvers/authorStat/authorStatResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("authorStatResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Author stat
    const as = newAuthorStat(em);
    // Then we can query it
    const result = await runFields(ctx, as, [
      "smallint",
      "integer",
      "nullableInteger",
      "bigint",
      "decimal",
      "real",
      "smallserial",
      "serial",
      "bigserial",
      "doublePrecision",
      "nullableText",
      "json",
      "createdAt",
      "updatedAt",
    ]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(authorStatResolvers);
const runField = makeRunObjectField(authorStatResolvers);
