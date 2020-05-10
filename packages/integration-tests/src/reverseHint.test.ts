import { Author, Book, BookReview } from "./entities";
import { reverseHint as reverse } from "joist-orm";

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
});
