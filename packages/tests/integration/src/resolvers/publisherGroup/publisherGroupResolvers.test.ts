import { newPublisherGroup } from "src/entities";
import { publisherGroupResolvers } from "src/resolvers/publisherGroup/publisherGroupResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("publisherGroupResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Publisher group
    const pg = newPublisherGroup(em);
    // Then we can query it
    const result = await runFields(ctx, pg, [
      "name",
      "numberOfBookReviews",
      "numberOfBookReviewsFormatted",
      "createdAt",
      "updatedAt",
    ]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(publisherGroupResolvers);
const runField = makeRunObjectField(publisherGroupResolvers);
