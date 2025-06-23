import { saveTinyPublisherGroup } from "src/resolvers/mutations/tinyPublisherGroup/saveTinyPublisherGroupResolver";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveTinyPublisherGroup", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveTinyPublisherGroup);
