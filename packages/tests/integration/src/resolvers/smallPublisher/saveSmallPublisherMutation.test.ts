import { saveSmallPublisher } from "src/resolvers/smallPublisher/saveSmallPublisherMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveSmallPublisher", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveSmallPublisher);
