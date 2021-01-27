import { reverseHint as reverse } from "joist-orm";
import { Author, Book, BookReview, Image, Publisher } from "./entities";

describe("reverseHint", () => {
  it("can do string hint", () => {
    expect(reverse(Author, "books")).toEqual([[Book, ["author"]]]);
  });

  it("can do array of string hints", () => {
    expect(reverse(Author, ["books", "authors"])).toEqual([
      [Book, ["author"]],
      [Author, ["mentor"]],
    ]);
  });

  it("can do hash of hints", () => {
    expect(reverse(Author, { books: "reviews" })).toEqual([
      [Book, ["author"]],
      [BookReview, ["book", "author"]],
    ]);
  });

  it("returns hints for entities in the middle", () => {
    expect(reverse(Publisher, { authors: { books: ["author", "reviews"] } })).toEqual([
      [Author, ["publisher"]],
      [Book, ["author", "publisher"]],
      [Author, ["books", "author", "publisher"]],
      [BookReview, ["book", "author", "publisher"]],
    ]);
  });

  it("can do a o2o relationship from object", () => {
    expect(reverse(Book, "image")).toEqual([[Image, ["book"]]]);
  });
});
