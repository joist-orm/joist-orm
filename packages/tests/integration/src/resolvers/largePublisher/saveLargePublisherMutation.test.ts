import { newAuthor } from "src/entities";
import { saveLargePublisher } from "src/resolvers/largePublisher/saveLargePublisherMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveLargePublisher", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const author = newAuthor(em);
    const result = await runSave(ctx, () => ({ name: "lp1", rating: 5, spotlightAuthor: author.id }));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveLargePublisher);
