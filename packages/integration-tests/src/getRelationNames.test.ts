import { bookMeta, bookReviewMeta, imageMeta } from "@src/entities";
import { getRelationNames } from "joist-orm";

describe("getRelationNames", () => {
  it("should work", () => {
    expect(getRelationNames(bookMeta)).toMatchInlineSnapshot(`
      Array [
        "reviews",
        "author",
        "image",
        "tags",
      ]
    `);
  });

  it("works for custom references", () => {
    expect(getRelationNames(imageMeta)).toMatchInlineSnapshot(`
      Array [
        "author",
        "book",
        "publisher",
        "owner",
      ]
    `);
  });

  it("works for hasOneThrough and hasOneDerived", () => {
    expect(getRelationNames(bookReviewMeta)).toMatchInlineSnapshot(`
      Array [
        "book",
        "author",
        "publisher",
      ]
    `);
  });
});
