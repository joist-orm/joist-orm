import { newSmallPublisher } from "src/entities";
import { smallPublisherResolvers } from "src/resolvers/objects/smallPublisher/smallPublisherResolvers";
import { makeRunObject, makeRunObjectFields } from "src/resolvers/testUtils";

describe("smallPublisherResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Small publisher
    const sp = newSmallPublisher(em);
    // Then we can query it
    const result = await runSmallPublisherKeys(ctx, sp, ["city"]);
    expect(sp).toMatchEntity(result);
  });
});

const runSmallPublisherKeys = makeRunObjectFields(smallPublisherResolvers);
const runSmallPublisher = makeRunObject(smallPublisherResolvers);
