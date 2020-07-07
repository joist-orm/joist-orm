import { authorMeta, bookMeta, bookReviewMeta, imageMeta } from "@src/entities";
import { getProperties } from "joist-orm";

describe("getProperties", () => {
  it("should work", () => {
    expect(getProperties(bookMeta)).toEqual(expect.arrayContaining(["advances", "reviews", "author", "image", "tags"]));
  });

  it("works for custom references", () => {
    expect(getProperties(imageMeta)).toEqual(expect.arrayContaining(["owner"]));
  });

  it("works for custom collections", () => {
    expect(getProperties(imageMeta)).toEqual(expect.arrayContaining(["owner"]));
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
