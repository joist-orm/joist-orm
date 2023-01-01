import { Context } from "src/context";
import { SaveLargePublisherInput } from "src/generated/graphql-types";
import { saveLargePublisher } from "src/resolvers/mutations/largePublisher/saveLargePublisherResolver";
import { run } from "src/resolvers/testUtils";

describe("saveLargePublisher", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSaveLargePublisher(ctx, () => ({ name: "lp" }));
    expect(result).toBeDefined();
  });
});

function runSaveLargePublisher(ctx: Context, inputFn: () => SaveLargePublisherInput) {
  return run(ctx, (ctx) => saveLargePublisher.saveLargePublisher({}, { input: inputFn() }, ctx, undefined!));
}
