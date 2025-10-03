import { savePublisher } from "src/resolvers/publisher/savePublisherMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("savePublisher", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(savePublisher);
