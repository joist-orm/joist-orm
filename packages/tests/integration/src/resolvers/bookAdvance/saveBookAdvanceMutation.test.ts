import { saveBookAdvance } from "src/resolvers/bookAdvance/saveBookAdvanceMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe.skip("saveBookAdvance", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveBookAdvance(ctx, () => ({}));
    // const ba = await em.load(BookAdvance, result.BookAdvance);
  });
});

const runSaveBookAdvance = makeRunInputMutation(saveBookAdvance);
