import { newPublisher } from "src/entities";
import { publisherResolvers } from "src/resolvers/publisher/publisherResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("publisherResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Publisher
    const p = newPublisher(em);
    // Then we can query it
    const result = await runFields(ctx, p, [
      "name",
      "latitude",
      "longitude",
      "hugeNumber",
      "numberOfBookReviews",
      "deletedAt",
      "titlesOfFavoriteBooks",
      "bookAdvanceTitlesSnapshot",
      "numberOfBookAdvancesSnapshot",
      "baseSyncDefault",
      "baseAsyncDefault",
      "createdAt",
      "updatedAt",
      "favoriteAuthorName",
      "rating",
    ]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(publisherResolvers);
const runField = makeRunObjectField(publisherResolvers);
