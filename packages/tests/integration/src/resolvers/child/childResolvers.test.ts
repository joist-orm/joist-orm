import { newChild } from "src/entities";
import { childResolvers } from "src/resolvers/child/childResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("childResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Child
    const child = newChild(em);
    // Then we can query it
    const result = await runFields(ctx, child, ["name", "createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(childResolvers);
const runField = makeRunObjectField(childResolvers);
