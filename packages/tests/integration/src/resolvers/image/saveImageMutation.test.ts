import { saveImage } from "src/resolvers/image/saveImageMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveImage", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveImage);
