import { Context } from "src/context";
import { SaveTagInput } from "src/generated/graphql-types";
import { run } from "src/resolvers/testUtils";
import { saveTag } from "src/resolvers/mutations/tag/saveTagResolver";
import "src/setupDbTests";

describe("saveTag", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveTag(ctx, () => ({}));
    // const t = await em.load(Tag, result.tag);
  });
});

async function runSaveTag(ctx: Context, inputFn: () => SaveTagInput) {
  return await run(ctx, async (ctx) => {
    return saveTag.saveTag({}, { input: inputFn() }, ctx, undefined!);
  });
}
