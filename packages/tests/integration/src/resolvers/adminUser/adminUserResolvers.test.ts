import { newAdminUser } from "src/entities";
import { adminUserResolvers } from "src/resolvers/adminUser/adminUserResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("adminUserResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Admin user
    const u = newAdminUser(em);
    // Then we can query it
    const result = await runFields(ctx, u, ["role"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(adminUserResolvers);
const runField = makeRunObjectField(adminUserResolvers);
