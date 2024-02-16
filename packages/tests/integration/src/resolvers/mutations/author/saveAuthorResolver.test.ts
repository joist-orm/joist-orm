import { Author } from "src/entities";
import { saveAuthor } from "src/resolvers/mutations/author/saveAuthorResolver";
import { makeRunInputMutation } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe("saveAuthor", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    await runSave(ctx, () => ({ firstName: "a1" }));
    const a = await em.load(Author, "a:1");
    expect(a).toMatchEntity({ firstName: "a1" });
  });
});

const runSave = makeRunInputMutation(saveAuthor);
