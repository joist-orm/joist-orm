import { saveSmallPublisherGroup } from "src/resolvers/smallPublisherGroup/saveSmallPublisherGroupMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveSmallPublisherGroup", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveSmallPublisherGroup);
