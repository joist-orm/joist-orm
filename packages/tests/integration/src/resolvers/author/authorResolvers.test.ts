import { newAuthor } from "src/entities";
import { authorResolvers } from "src/resolvers/author/authorResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("authorResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Author
    const a = newAuthor(em);
    // Then we can query it
    const result = await runFields(ctx, a, [
      "firstName",
      "lastName",
      "ssn",
      "initials",
      "numberOfBooks",
      "bookComments",
      "isPopular",
      "age",
      "graduated",
      "nickNames",
      "nickNamesUpper",
      "wasEverPopular",
      "isFunny",
      "mentorNames",
      "address",
      "businessAddress",
      "quotes",
      "numberOfAtoms",
      "deletedAt",
      "numberOfPublicReviews",
      "numberOfPublicReviews2",
      "tagsOfAllBooks",
      "search",
      "certificate",
      "createdAt",
      "updatedAt",
    ]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(authorResolvers);
const runField = makeRunObjectField(authorResolvers);
