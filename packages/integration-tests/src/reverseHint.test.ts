import { Loadable, reverseHint, reverseReactiveHint } from "joist-orm";
import { Author, Book, BookReview, Image, Publisher } from "./entities";

describe("reverseHint", () => {
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
    type l = Loadable<Book>;
    expect(reverseReactiveHint(Author, { image: "fileName" })).toEqual([
      {
        entity: Image,
        fields: ["fileName"],
        path: ["author"],
      },
    ]);
  });
});
