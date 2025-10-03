import { makeRunInputMutation } from "src/resolvers/testUtils";
import { saveUser } from "src/resolvers/user/saveUserMutation";

describe("saveUser", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveUser);
