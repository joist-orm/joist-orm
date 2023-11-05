import { newPublisherGroup } from "src/entities";
import { publisherGroupResolvers } from "src/resolvers/objects/publisherGroup/publisherGroupResolvers";
import { makeRunObject, makeRunObjectFields } from "src/resolvers/testUtils";

describe("publisherGroupResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Publisher group
    const pg = newPublisherGroup(em);
    // Then we can query it
    const result = await runPublisherGroupKeys(ctx, pg, ["name"]);
    expect(pg).toMatchEntity(result);
  });
});

const runPublisherGroupKeys = makeRunObjectFields(publisherGroupResolvers);
const runPublisherGroup = makeRunObject(publisherGroupResolvers);
