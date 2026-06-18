import { newUser } from "src/entities";
import { makeRunQuery } from "src/resolvers/testUtils";
import { user } from "src/resolvers/user/userQuery";

describe("user", () => {
  it.withCtx("returns a User", async (ctx) => {
    const u = newUser(ctx.em);
    const result = await run(ctx, () => ({ id: u.id }));
    expect(result).toMatchEntity(u);
  });
});

const run = makeRunQuery(user);
