import { Context } from "src/context";
import { SaveImageInput } from "src/generated/graphql-types";
import { saveImage } from "src/resolvers/mutations/image/saveImageResolver";
import { run } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe("saveImage", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveImage(ctx, () => ({}));
    // const i = await em.load(Image, result.Image);
  });
});

async function runSaveImage(ctx: Context, inputFn: () => SaveImageInput) {
  return await run(ctx, async (ctx) => {
    return saveImage.saveImage({}, { input: inputFn() }, ctx, undefined!);
  });
}
