import { newLargePublisher } from "src/entities";
import { largePublisherResolvers } from "src/resolvers/objects/largePublisher/largePublisherResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("largePublisherResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Large publisher
    const lp = newLargePublisher(em, { authors: [{}] });
    // Then we can query it
    const result = await runLargePublisherKeys(ctx, lp, ["country"]);
    expect(lp).toMatchEntity(result);
  });
});

const runLargePublisherKeys = makeRunObjectFields(largePublisherResolvers);
const runLargePublisher = makeRunObjectField(largePublisherResolvers);
