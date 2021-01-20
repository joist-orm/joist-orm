import { reverseHint as reverse } from "joist-orm";
import { Author, Book, BookReview, Image } from "./entities";

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

  it("can do array of string", () => {
    expect(reverse(Author, { books: "reviews" })).toEqual([[BookReview, ["book", "author"]]]);
  });

  it("can do a o2o relationship from object", () => {
    expect(reverse(Book, "image")).toEqual([[Image, ["book"]]]);
  });
});
