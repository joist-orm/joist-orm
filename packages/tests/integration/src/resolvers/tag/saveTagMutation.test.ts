import { saveTag } from "src/resolvers/tag/saveTagMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe("saveTag", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveTag(ctx, () => ({ name: "t1" }));
    // const t = await em.load(Tag, result.tag);
  });
});

const runSaveTag = makeRunInputMutation(saveTag);
