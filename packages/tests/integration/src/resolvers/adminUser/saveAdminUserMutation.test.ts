import { saveAdminUser } from "src/resolvers/adminUser/saveAdminUserMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveAdminUser", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({
      name: "admin1",
      email: "admin1@test.com",
      originalEmail: "admin1@test.com",
      role: "admin",
    }));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveAdminUser);
