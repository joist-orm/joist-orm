import { Context } from "src/context";
import { SaveSmallPublisherInput } from "src/generated/graphql-types";
import { saveSmallPublisher } from "src/resolvers/smallPublisher/saveSmallPublisherMutation";
import { run } from "src/resolvers/testUtils";

describe("saveSmallPublisher", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSaveSmallPublisher(ctx, () => ({ name: "sp1", city: "a" }));
    expect(result).toBeDefined();
  });
});

function runSaveSmallPublisher(ctx: Context, inputFn: () => SaveSmallPublisherInput) {
  return run(ctx, (ctx) => saveSmallPublisher.saveSmallPublisher({}, { input: inputFn() }, ctx, undefined!));
}
