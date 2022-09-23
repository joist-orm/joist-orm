import { saveAuthor } from "src/resolvers/mutations/author/saveAuthorResolver";
import { makeRunInputMutation } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe("saveAuthor", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveAuthor(ctx, () => ({}));
    // const a = await em.load(Author, result.Author);
  });
});

const runSaveAuthor = makeRunInputMutation(saveAuthor);
