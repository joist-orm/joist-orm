import { savePublisher } from "src/resolvers/mutations/publisher/savePublisherResolver";
import { makeRunInputMutation } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe.skip("savePublisher", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSavePublisher(ctx, () => ({}));
    // const p = await em.load(Publisher, result.Publisher);
  });
});

const runSavePublisher = makeRunInputMutation(savePublisher);
