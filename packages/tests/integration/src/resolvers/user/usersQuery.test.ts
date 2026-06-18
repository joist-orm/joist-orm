import { makeRunQuery } from "src/resolvers/testUtils";
import { users } from "src/resolvers/user/usersQuery";

describe("users", () => {
  it.withCtx("returns users", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(users);
