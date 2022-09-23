import { saveBookAdvance } from "src/resolvers/mutations/bookAdvance/saveBookAdvanceResolver";
import { makeRunInputMutation } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe("saveBookAdvance", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveBookAdvance(ctx, () => ({}));
    // const ba = await em.load(BookAdvance, result.BookAdvance);
  });
});

const runSaveBookAdvance = makeRunInputMutation(saveBookAdvance);
