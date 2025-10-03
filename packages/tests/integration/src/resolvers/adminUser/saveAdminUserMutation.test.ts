import { saveAdminUser } from "src/resolvers/adminUser/saveAdminUserMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveAdminUser", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveAdminUser);
