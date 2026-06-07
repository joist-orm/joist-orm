import { images } from "src/resolvers/image/imagesQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("images", () => {
  it.withCtx("returns images", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(images);
