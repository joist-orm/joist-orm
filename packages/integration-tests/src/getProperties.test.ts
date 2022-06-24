import { authorMeta, bookMeta, bookReviewMeta, imageMeta, publisherMeta } from "@src/entities";
import { getProperties } from "joist-orm";

describe("getProperties", () => {
  it("should work", () => {
    expect(getProperties(bookMeta)).toEqual([
      "entity",
      "advances",
      "reviews",
      "comments",
      "author",
      "currentDraftAuthor",
      "image",
      "tags",
      "rulesInvoked",
      "firstNameRuleInvoked",
      "favoriteColorsRuleInvoked",
    ]);
  });

  it("works for custom references", () => {
    expect(getProperties(imageMeta)).toEqual(expect.arrayContaining(["owner"]));
  });

  it("works for custom collections", () => {
    expect(getProperties(publisherMeta)).toEqual(expect.arrayContaining(["allImages"]));
  });

  it("works for hasOneThrough and hasOneDerived", () => {
    expect(getProperties(bookReviewMeta)).toEqual(expect.arrayContaining(["author", "publisher"]));
  });

  it("works for hasManyThrough and hasManyDerived", () => {
    expect(getProperties(authorMeta)).toEqual(expect.arrayContaining(["reviews", "reviewedBooks"]));
  });

  it("includes non-relations", () => {
    expect(getProperties(authorMeta)).toEqual(
      expect.arrayContaining([
        "withLoadedBooks",
        "initials",
        "fullName",
        "isPopular",
        "hasBooks",
        "authors",
        "books",
        "mentor",
        "publisher",
        "image",
        "beforeFlushRan",
        "beforeDeleteRan",
        "afterCommitRan",
      ]),
    );
  });
});
