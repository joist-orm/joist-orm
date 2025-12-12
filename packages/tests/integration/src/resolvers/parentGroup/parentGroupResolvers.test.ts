import { newParentGroup } from "src/entities";
import { parentGroupResolvers } from "src/resolvers/parentGroup/parentGroupResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("parentGroupResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Parent group
    const parentGroup = newParentGroup(em);
    // Then we can query it
    const result = await runFields(ctx, parentGroup, ["name", "createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(parentGroupResolvers);
const runField = makeRunObjectField(parentGroupResolvers);
