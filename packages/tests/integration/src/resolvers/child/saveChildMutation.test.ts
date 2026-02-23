import { saveChild } from "src/resolvers/child/saveChildMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveChild", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveChild);
