import { saveEmployee } from "src/resolvers/employee/saveEmployeeMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveEmployee", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({ name: "Jill" }));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveEmployee);
