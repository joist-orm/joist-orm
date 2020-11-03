import { Context } from "src/context";
import { SaveBookInput } from "src/generated/graphql-types";
import { run } from "src/resolvers/testUtils";
import { saveBook } from "src/resolvers/mutations/book/saveBookResolver";

import "src/setupDbTests";

describe("saveBook", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveBook(ctx, () => ({}));
    // const b = await em.load(Book, result.Book);
  });
});

async function runSaveBook(ctx: Context, inputFn: () => SaveBookInput) {
  return await run(ctx, async (ctx) => {
    return saveBook.saveBook({}, { input: inputFn() }, ctx, undefined!);
  });
}
