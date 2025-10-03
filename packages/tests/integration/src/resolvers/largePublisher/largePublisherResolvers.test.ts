import { newLargePublisher } from "src/entities";
import { largePublisherResolvers } from "src/resolvers/largePublisher/largePublisherResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("largePublisherResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Large publisher
    const p = newLargePublisher(em);
    // Then we can query it
    const result = await runFields(ctx, p, ["sharedColumn", "country", "rating"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(largePublisherResolvers);
const runField = makeRunObjectField(largePublisherResolvers);
