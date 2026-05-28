import { newAdminUser } from "src/entities";
import { adminUser } from "src/resolvers/adminUser/adminUserQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("adminUser", () => {
  it.withCtx("returns a Admin user", async (ctx) => {
    const u = newAdminUser(ctx.em);
    const result = await run(ctx, () => ({ id: u.id }));
    expect(result).toMatchEntity(u);
  });
});

const run = makeRunQuery(adminUser);
