import { newUserPublisherGroup } from "src/entities";
import { userPublisherGroupResolvers } from "src/resolvers/objects/userPublisherGroup/userPublisherGroupResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("userPublisherGroupResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a User publisher group
    const upg = newUserPublisherGroup(em);
    // Then we can query it
    const result = await runFields(ctx, upg, ["createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(userPublisherGroupResolvers);
const runField = makeRunObjectField(userPublisherGroupResolvers);
