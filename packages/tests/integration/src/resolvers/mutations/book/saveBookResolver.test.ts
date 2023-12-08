import { saveBook } from "src/resolvers/mutations/book/saveBookResolver";
import { makeRunInputMutation } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe.skip("saveBook", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveBook(ctx, () => ({}));
    // const b = await em.load(Book, result.Book);
  });
});

const runSaveBook = makeRunInputMutation(saveBook);
