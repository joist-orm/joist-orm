import { newUser } from "src/entities";
import { userResolvers } from "src/resolvers/objects/user/userResolvers";
import { makeRunObjectFields } from "src/resolvers/testUtils";

describe("userResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a User
    const u = newUser(em);
    // Then we can query it
    const result = await runUserKeys(ctx, u, ["name", "email"]);
    expect(u).toMatchEntity(result);
  });
});

const runUserKeys = makeRunObjectFields(userResolvers);
