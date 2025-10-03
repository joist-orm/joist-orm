import { newAuthor } from "src/entities";
import { saveAuthorSchedule } from "src/resolvers/authorSchedule/saveAuthorScheduleMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveAuthorSchedule", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const author = newAuthor(em);
    const result = await runSave(ctx, () => ({ author: author.id }));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveAuthorSchedule);
