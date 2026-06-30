import { newImage } from "src/entities";
import { image } from "src/resolvers/image/imageQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("image", () => {
  it.withCtx("returns a Image", async (ctx) => {
    const i = newImage(ctx.em, { author: {} });
    const result = await run(ctx, () => ({ id: i.id }));
    expect(result).toMatchEntity(i);
  });
});

const run = makeRunQuery(image);
