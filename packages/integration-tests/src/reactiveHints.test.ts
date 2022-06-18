import { Author, Book, BookReview, Image, Publisher } from "@src/entities";
import { getMetadata, reverseHint, reverseReactiveHint } from "joist-orm";
import { convertToLoadHint } from "joist-orm/build/src/reactiveHints";

describe("reactiveHints", () => {
  it("can do string hint", () => {
    expect(reverseHint(Author, "books")).toEqual([{ entity: Book, fields: ["author"], path: ["author"] }]);
  });

  it("can do array of string hints", () => {
    expect(reverseHint(Author, ["books", "authors"])).toEqual([
      { entity: Book, fields: ["author"], path: ["author"] },
      { entity: Author, fields: ["mentor"], path: ["mentor"] },
    ]);
  });

  it("can do hash of hints", () => {
    expect(reverseHint(Author, { books: "reviews" })).toEqual([
      { entity: Book, fields: ["author"], path: ["author"] },
      { entity: BookReview, fields: ["book"], path: ["book", "author"] },
    ]);
  });

  it("returns hints for entities in the middle", () => {
    expect(reverseHint(Publisher, { authors: { books: ["author", "reviews"] } })).toEqual([
      { entity: Author, fields: ["publisher"], path: ["publisher"] },
      { entity: Book, fields: ["author"], path: ["author", "publisher"] },
      { entity: Author, fields: ["books"], path: ["books", "author", "publisher"] },
      { entity: BookReview, fields: ["book"], path: ["book", "author", "publisher"] },
    ]);
  });

  it("can do a o2o relationship from object", () => {
    expect(reverseHint(Book, "image")).toEqual([{ entity: Image, fields: ["book"], path: ["book"] }]);
  });

  it("can do immediate primitive field names", () => {
    expect(reverseReactiveHint(Author, "firstName")).toEqual([{ entity: Author, fields: ["firstName"], path: [] }]);
  });

  it("can do parent primitive field names", () => {
    expect(reverseReactiveHint(Book, { author: ["firstName", "lastName"] })).toEqual([
      { entity: Author, fields: ["firstName", "lastName"], path: ["books"] },
    ]);
  });

  it("can do grand-parent primitive field names", () => {
    expect(reverseReactiveHint(BookReview, { book: { author: ["firstName", "lastName"] } })).toEqual([
      { entity: Author, fields: ["firstName", "lastName"], path: ["books", "reviews"] },
    ]);
  });

  it("can do parent and grand-parent primitive field names", () => {
    expect(reverseReactiveHint(BookReview, { book: { title: {}, author: ["firstName", "lastName"] } })).toEqual([
      { entity: Book, fields: ["title"], path: ["reviews"] },
      { entity: Author, fields: ["firstName", "lastName"], path: ["books", "reviews"] },
    ]);
  });

  it("can do child o2m with primitive field names", () => {
    expect(reverseReactiveHint(Author, { books: "title" })).toEqual([
      {
        entity: Book,
        fields: ["title"],
        path: ["author"],
      },
    ]);
  });

  it("can do child o2o with primitive field names", () => {
    expect(reverseReactiveHint(Author, { image: "fileName" })).toEqual([
      {
        entity: Image,
        fields: ["fileName"],
        path: ["author"],
      },
    ]);
  });

  describe("convertToPopulateHint", () => {
    it("works with child o2o and primitive field names", () => {
      expect(convertToLoadHint(getMetadata(Author), { image: "fileName" })).toEqual({ image: {} });
    });

    it("works with child o2m and primitive field names", () => {
      expect(convertToLoadHint(getMetadata(Author), { books: "title" })).toEqual({ books: {} });
    });

    it("works with parent m2o and primitive field names", () => {
      expect(convertToLoadHint(getMetadata(Author), { publisher: "name" })).toStrictEqual({ publisher: {} });
      expect(convertToLoadHint(getMetadata(Book), { author: "firstName" })).toStrictEqual({ author: {} });
      expect(convertToLoadHint(getMetadata(BookReview), { book: { author: "firstName" } })).toStrictEqual({
        book: { author: {} },
      });
    });
  });

  // it("can type-check", () => {
  //   // author hint that reruns on book review changes
  //   const hint = {
  //     "book:rx": { "reviews:rx": ["title:rx"] },
  //   };
  // });
});
