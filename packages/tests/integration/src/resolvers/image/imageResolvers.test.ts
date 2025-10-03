import { newImage } from "src/entities";
import { imageResolvers } from "src/resolvers/image/imageResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("imageResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Image
    const i = newImage(em);
    // Then we can query it
    const result = await runFields(ctx, i, ["fileName", "createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(imageResolvers);
const runField = makeRunObjectField(imageResolvers);
