import { saveLargePublisher } from "src/resolvers/largePublisher/saveLargePublisherMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveLargePublisher", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveLargePublisher);
