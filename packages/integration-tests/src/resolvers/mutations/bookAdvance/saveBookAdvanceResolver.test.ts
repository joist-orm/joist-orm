import { Context } from "src/context";
import { SaveBookAdvanceInput } from "src/generated/graphql-types";
import { saveBookAdvance } from "src/resolvers/mutations/bookAdvance/saveBookAdvanceResolver";
import { run } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe("saveBookAdvance", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveBookAdvance(ctx, () => ({}));
    // const ba = await em.load(BookAdvance, result.BookAdvance);
  });
});

async function runSaveBookAdvance(ctx: Context, inputFn: () => SaveBookAdvanceInput) {
  return await run(ctx, async (ctx) => {
    return saveBookAdvance.saveBookAdvance({}, { input: inputFn() }, ctx, undefined!);
  });
}
