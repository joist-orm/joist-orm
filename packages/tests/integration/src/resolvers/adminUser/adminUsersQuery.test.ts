import { adminUsers } from "src/resolvers/adminUser/adminUsersQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("adminUsers", () => {
  it.withCtx("returns adminUsers", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(adminUsers);
