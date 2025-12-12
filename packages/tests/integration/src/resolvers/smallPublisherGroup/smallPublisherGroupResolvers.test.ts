import { newSmallPublisherGroup } from "src/entities";
import { smallPublisherGroupResolvers } from "src/resolvers/smallPublisherGroup/smallPublisherGroupResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("smallPublisherGroupResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Small publisher group
    const pg = newSmallPublisherGroup(em);
    // Then we can query it
    const result = await runFields(ctx, pg, ["smallName"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(smallPublisherGroupResolvers);
const runField = makeRunObjectField(smallPublisherGroupResolvers);
