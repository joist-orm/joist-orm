import { Context } from "src/context";
import { SavePublisherInput } from "src/generated/graphql-types";
import { savePublisher } from "src/resolvers/mutations/publisher/savePublisherResolver";
import { run } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe("savePublisher", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSavePublisher(ctx, () => ({}));
    // const p = await em.load(Publisher, result.Publisher);
  });
});

async function runSavePublisher(ctx: Context, inputFn: () => SavePublisherInput) {
  return await run(ctx, async (ctx) => {
    return savePublisher.savePublisher({}, { input: inputFn() }, ctx, undefined!);
  });
}
