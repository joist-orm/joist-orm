import { newImage } from "src/entities";
import { imageResolvers } from "src/resolvers/objects/image/imageResolvers";
import { makeRunObjectFields } from "src/resolvers/testUtils";

describe("imageResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Image
    const i = newImage(em, { author: {} });
    // Then we can query it
    const result = await runImage(ctx, i, []);
    expect(result).toMatchObject({});
  });
});

const runImage = makeRunObjectFields(imageResolvers);
