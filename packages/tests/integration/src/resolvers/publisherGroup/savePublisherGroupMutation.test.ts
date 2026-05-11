import { savePublisherGroup } from "src/resolvers/publisherGroup/savePublisherGroupMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("savePublisherGroup", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(savePublisherGroup);
