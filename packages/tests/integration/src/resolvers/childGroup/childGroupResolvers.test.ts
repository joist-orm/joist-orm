import { newChildGroup } from "src/entities";
import { childGroupResolvers } from "src/resolvers/childGroup/childGroupResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("childGroupResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Child group
    const cg = newChildGroup(em);
    // Then we can query it
    const result = await runFields(ctx, cg, ["name", "createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(childGroupResolvers);
const runField = makeRunObjectField(childGroupResolvers);
