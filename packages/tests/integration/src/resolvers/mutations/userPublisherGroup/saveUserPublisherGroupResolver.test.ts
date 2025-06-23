import { saveUserPublisherGroup } from "src/resolvers/mutations/userPublisherGroup/saveUserPublisherGroupResolver";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveUserPublisherGroup", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveUserPublisherGroup);
