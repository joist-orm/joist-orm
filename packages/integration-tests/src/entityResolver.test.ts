import { Author } from "@src/entities";
import { insertAuthor } from "@src/entities/inserts";
import { newEntityManager } from "@src/setupDbTests";
import { entityResolver } from "joist-graphql-resolver-utils";

describe("entityResolver", () => {
  it("can load derived values without calculating them", async () => {
    // Given an author with a technically incorrect numberOfPublicReviews
    await insertAuthor({ first_name: "a1", number_of_public_reviews: 2 });
    const em = newEntityManager();
    // When we access it via the entity resolver
    const a = await em.load(Author, "a:1");
    const result = entityResolver(Author.metadata).numberOfPublicReviews(a, {}, {}, undefined!);
    // Then we got the stale value
    expect(result).toBe(2);
  });
});
