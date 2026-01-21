import { newUser } from "src/entities";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";
import { userResolvers } from "src/resolvers/user/userResolvers";

describe("userResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a User
    const u = newUser(em);
    // Then we can query it
    const result = await runFields(ctx, u, [
      "name",
      "email",
      "ipAddress",
      "password",
      "bio",
      "originalEmail",
      "trialPeriod",
      "createdAt",
      "updatedAt",
    ]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(userResolvers);
const runField = makeRunObjectField(userResolvers);
