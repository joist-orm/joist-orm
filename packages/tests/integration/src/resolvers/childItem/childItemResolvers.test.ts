import { newChildItem } from "src/entities";
import { childItemResolvers } from "src/resolvers/childItem/childItemResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("childItemResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Child item
    const ci = newChildItem(em);
    // Then we can query it
    const result = await runFields(ctx, ci, ["name", "createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(childItemResolvers);
const runField = makeRunObjectField(childItemResolvers);
