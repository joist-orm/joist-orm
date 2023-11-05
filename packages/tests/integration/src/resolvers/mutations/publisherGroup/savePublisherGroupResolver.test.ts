import { Context } from "src/context";
import { SavePublisherGroupInput } from "src/generated/graphql-types";
import { savePublisherGroup } from "src/resolvers/mutations/publisherGroup/savePublisherGroupResolver";
import { run } from "src/resolvers/testUtils";

describe("savePublisherGroup", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSavePublisherGroup(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

function runSavePublisherGroup(ctx: Context, inputFn: () => SavePublisherGroupInput) {
  return run(ctx, (ctx) => savePublisherGroup.savePublisherGroup({}, { input: inputFn() }, ctx, undefined!));
}
