import { saveImage } from "src/resolvers/image/saveImageMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe.skip("saveImage", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveImage(ctx, () => ({}));
    // const i = await em.load(Image, result.Image);
  });
});

const runSaveImage = makeRunInputMutation(saveImage);
