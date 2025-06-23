import { newTinyPublisherGroup } from "src/entities";
import { tinyPublisherGroupResolvers } from "src/resolvers/objects/tinyPublisherGroup/tinyPublisherGroupResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("tinyPublisherGroupResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Tiny publisher group
    const pg = newTinyPublisherGroup(em);
    // Then we can query it
    const result = await runFields(ctx, pg, []);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(tinyPublisherGroupResolvers);
const runField = makeRunObjectField(tinyPublisherGroupResolvers);
