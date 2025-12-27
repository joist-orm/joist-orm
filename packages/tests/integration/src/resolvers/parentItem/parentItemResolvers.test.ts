import { newParentItem } from "src/entities";
import { parentItemResolvers } from "src/resolvers/parentItem/parentItemResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("parentItemResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Parent item
    const pi = newParentItem(em);
    // Then we can query it
    const result = await runFields(ctx, pi, ["name", "createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(parentItemResolvers);
const runField = makeRunObjectField(parentItemResolvers);
