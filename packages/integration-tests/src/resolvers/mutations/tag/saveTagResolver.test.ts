import { saveTag } from "src/resolvers/mutations/tag/saveTagResolver";
import { makeRunInputMutation } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe("saveTag", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveTag(ctx, () => ({}));
    // const t = await em.load(Tag, result.tag);
  });
});

const runSaveTag = makeRunInputMutation(saveTag);
