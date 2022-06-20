import { Author, Book, BookReview, Image, Publisher } from "@src/entities";
import { getMetadata, Loaded, LoadHint, Reacted, ReactiveHint, reverseHint, reverseReactiveHint } from "joist-orm";
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
      { entity: Book, fields: ["author"], path: [] },
      { entity: Author, fields: ["firstName", "lastName"], path: ["books"] },
    ]);
  });

  it("can do grand-parent primitive field names", () => {
    expect(reverseReactiveHint(BookReview, { book: { author: ["firstName", "lastName"] } })).toEqual([
      { entity: BookReview, fields: ["book"], path: [] },
      { entity: Book, fields: ["author"], path: ["reviews"] },
      { entity: Author, fields: ["firstName", "lastName"], path: ["books", "reviews"] },
    ]);
  });

  it("can do parent and grand-parent primitive field names", () => {
    expect(reverseReactiveHint(BookReview, { book: { title: {}, author: ["firstName", "lastName"] } })).toEqual([
      { entity: BookReview, fields: ["book"], path: [] },
      { entity: Book, fields: ["title", "author"], path: ["reviews"] },
      { entity: Author, fields: ["firstName", "lastName"], path: ["books", "reviews"] },
    ]);
  });

  it("can do child o2m with primitive field names", () => {
    expect(reverseReactiveHint(Author, { books: "title" })).toEqual([
      // Include the Author so that if no books are added, the rule still rules on create
      { entity: Author, fields: [], path: [] },
      { entity: Book, fields: ["author", "title"], path: ["author"] },
    ]);
  });

  it("can do child o2m with w/o any fields", () => {
    expect(reverseReactiveHint(Author, "books")).toEqual([
      { entity: Author, fields: [], path: [] },
      { entity: Book, fields: ["author"], path: ["author"] },
    ]);
  });

  it("can do child o2o with primitive field names", () => {
    expect(reverseReactiveHint(Author, { image: "fileName" })).toEqual([
      { entity: Author, fields: [], path: [] },
      { entity: Image, fields: ["author", "fileName"], path: ["author"] },
    ]);
  });

  it("skips read-only m2o parents", () => {
    expect(reverseReactiveHint(Book, { author_ro: "firstName:ro" })).toEqual([{ entity: Book, fields: [], path: [] }]);
  });

  it("skips read-only o2m children and grand-children", () => {
    expect(reverseReactiveHint(Author, { books_ro: "reviews:ro", firstName_ro: {} })).toEqual([
      { entity: Author, fields: [], path: [] },
    ]);
  });

  it("can do read-only string hint", () => {
    // expect(reverseHint(Author, "books:ro")).toEqual([{ entity: Book, fields: ["author"], path: ["author"] }]);
    expect(reverseReactiveHint(Author, "publisher:ro")).toEqual([{ entity: Author, fields: [], path: [] }]);
  });

  it("can do array of read-only string hints", () => {
    expect(reverseReactiveHint(Author, ["firstName:ro", "publisher:ro"])).toEqual([
      { entity: Author, fields: [], path: [] },
    ]);
  });

  it("can do hash of read-only hints", () => {
    // TODO Enforce that `name` must be `name:ro`
    expect(reverseReactiveHint(Author, { publisher_ro: "name:ro" })).toEqual([
      { entity: Author, fields: [], path: [] },
    ]);
    expect(reverseReactiveHint(BookReview, { book: "author:ro" })).toEqual([
      { entity: BookReview, fields: ["book"], path: [] },
    ]);
  });

  it("supports async properties", () => {
    expect(reverseReactiveHint(Author, "numberOfBooks2")).toEqual([
      { entity: Author, fields: [], path: [] },
      { entity: Book, fields: ["author"], path: ["author"] },
    ]);
    // This is kind of a circular rule, so we get two reactions back:
    expect(reverseReactiveHint(Book, { author: "numberOfBooks2" })).toEqual([
      // When the book itself changes it author, rerun the rule "for it"
      { entity: Book, fields: ["author"], path: [] },
      // Also run the rule for all the author's other books
      { entity: Book, fields: ["author"], path: ["author", "books"] },
    ]);
  });

  it("supports hasOneDerived", () => {
    // BookReview.publisher is a hasOneDerived
    expect(reverseReactiveHint(BookReview, { publisher: "name" })).toEqual([
      { entity: BookReview, fields: [], path: [] },
      { entity: BookReview, fields: ["book"], path: [] },
      { entity: Book, fields: ["author"], path: ["reviews"] },
      { entity: Author, fields: ["publisher"], path: ["books", "reviews"] },
    ]);
  });

  it("supports hasOneThrough", () => {
    // BookReview.author is a hasOneThrough
    expect(reverseReactiveHint(BookReview, { author: "firstName" })).toEqual([
      { entity: BookReview, fields: [], path: [] },
      { entity: BookReview, fields: ["book"], path: [] },
      { entity: Book, fields: ["author"], path: ["reviews"] },
    ]);
  });

  it("supports hasManyThrough", () => {
    // BookReview.author is a hasManyThrough
    expect(reverseReactiveHint(Author, { reviews: "rating" })).toEqual([
      { entity: Author, fields: [], path: [] },
      { entity: Book, fields: ["author"], path: ["author"] },
      { entity: BookReview, fields: ["book"], path: ["book", "author"] },
    ]);
  });

  describe("convertToLoadHint", () => {
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

  describe("type checks", () => {
    // These functions are just for testing the type checking of `ReactiveHint` and `Reacted`.
    // We don't actually run them because they would NPE on the various `null!` values, but
    // are still checking them in to provide coverage of the mapped types.

    function testLoads() {
      const b1: LoadHint<BookReview> = { book: { author: "publisher" } };
      const br: Loaded<BookReview, { book: { author: "publisher" } }> = null!;
      console.log(br.book.get.author.get.publisher.get);
    }

    function testing() {
      // just book 1 field
      const b4: ReactiveHint<Book> = "title";
      const b4e: Reacted<Book, "title"> = null!;
      console.log(b4e.title);

      // just book 2 fields
      const b5: ReactiveHint<Book> = ["title", "order"];
      const b5e: Reacted<Book, ["title", "order"]> = null!;
      console.log(b5e.order, b5e.title);

      // book m2o to author and 1 field
      const b1: ReactiveHint<Book> = { author: "firstName" };

      // book m2o to author and 2 fields
      const b2: ReactiveHint<Book> = { author: ["firstName", "lastName"] };
      const b2e: Reacted<Book, { author: ["firstName", "lastName"] }> = null!;
      console.log(b2e.author.get.firstName, b2e.author.get.lastName);

      // book m2o to author and nested hint to publisher
      const b3: ReactiveHint<Book> = { author: { publisher: "name", firstName: {} } };
      const b3e: Reacted<Book, { author: { publisher: "name"; firstName: {} } }> = null!;
      console.log(b3e.author.get.firstName, b3e.author.get.publisher.get!.name);

      // author o2m to books
      const b6: ReactiveHint<Author> = { books: {} };
      const b6e: Reacted<Author, { books: {} }> = null!;
      console.log(b6e.books.get.length);
    }

    function testingReadOnly() {
      // just book 1 field
      const b4: ReactiveHint<Book> = "title:ro";
      const b4e: Reacted<Book, "title:ro"> = null!;
      console.log(b4e.title);

      // just book 2 fields
      const b5: ReactiveHint<Book> = ["title", "order:ro"];
      const b5e: Reacted<Book, ["title", "order:ro"]> = null!;
      console.log(b5e.order, b5e.title);

      // book m2o to author and 1 field
      const b1: ReactiveHint<Book> = { author: "firstName:ro" };

      // book m2o to author and 2 fields
      const b2: ReactiveHint<Book> = { author: ["firstName", "lastName:ro"] };
      const b2e: Reacted<Book, { author: ["firstName", "lastName:ro"] }> = null!;
      console.log(b2e.author.get.firstName, b2e.author.get.lastName);

      // book m2o to author and nested hint to publisher
      const b3: ReactiveHint<Book> = { author: { publisher: "name", firstName: {} } };
      const b3e: Reacted<Book, { author: { publisher: "name"; firstName_ro: {} } }> = null!;
      console.log(b3e.author.get.firstName, b3e.author.get.publisher.get!.name);
    }
  });
});
