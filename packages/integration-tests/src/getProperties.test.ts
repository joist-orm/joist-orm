import { authorMeta, bookMeta, bookReviewMeta, imageMeta } from "@src/entities";
import { getProperties } from "joist-orm";

describe("getProperties", () => {
  it("should work", () => {
    expect(getProperties(bookMeta)).toMatchInlineSnapshot(`
      Array [
        "reviews",
        "author",
        "image",
        "tags",
      ]
    `);
  });

  it("works for custom references", () => {
    expect(getProperties(imageMeta)).toMatchInlineSnapshot(`
      Array [
        "ownerRef",
        "author",
        "book",
        "publisher",
        "owner",
      ]
    `);
  });

  it("works for hasOneThrough and hasOneDerived", () => {
    expect(getProperties(bookReviewMeta)).toMatchInlineSnapshot(`
      Array [
        "book",
        "author",
        "publisher",
      ]
    `);
  });

  it("includes non-relations", () => {
    expect(getProperties(authorMeta)).toMatchInlineSnapshot(`
      Array [
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
      ]
    `);
  });
});
