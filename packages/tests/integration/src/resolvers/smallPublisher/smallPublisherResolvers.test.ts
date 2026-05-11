import { newSmallPublisher } from "src/entities";
import { smallPublisherResolvers } from "src/resolvers/smallPublisher/smallPublisherResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("smallPublisherResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Small publisher
    const p = newSmallPublisher(em);
    // Then we can query it
    const result = await runFields(ctx, p, ["city", "sharedColumn", "allAuthorNames"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(smallPublisherResolvers);
const runField = makeRunObjectField(smallPublisherResolvers);
