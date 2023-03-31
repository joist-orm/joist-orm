import { Context } from "src/context";
import { SaveUserInput } from "src/generated/graphql-types";
import { saveUser } from "src/resolvers/mutations/user/saveUserResolver";
import { run } from "src/resolvers/testUtils";

describe("saveUser", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveUser(ctx, () => ({ name: "test user", email: "test@test.com" }));
    expect(result).toBeDefined();
  });
});

function runSaveUser(ctx: Context, inputFn: () => SaveUserInput) {
  return run(ctx, (ctx) => saveUser.saveUser({}, { input: inputFn() }, ctx, undefined!));
}
