import { Author, Book, BookReview, Comment, Image, Tag } from "@src/entities";
import { LoadHint, Loaded, Reacted, ReactiveHint, getMetadata, reverseReactiveHint } from "joist-orm";
import { convertToLoadHint } from "joist-orm/build/reactiveHints";

const am = getMetadata(Author);

describe("reactiveHints", () => {
  it("can do immediate primitive field names", () => {
    expect(reverseReactiveHint(Author, Author, "firstName")).toEqual([
      { entity: Author, fields: ["firstName"], path: [] },
    ]);
  });

  it("can do parent primitive field names", () => {
    expect(reverseReactiveHint(Book, Book, { author: ["firstName", "lastName"] })).toEqual([
      { entity: Book, fields: ["author"], path: [] },
      { entity: Author, fields: ["firstName", "lastName"], path: ["books"] },
    ]);
  });

  it("can do grand-parent primitive field names", () => {
    expect(reverseReactiveHint(BookReview, BookReview, { book: { author: ["firstName", "lastName"] } })).toEqual([
      { entity: BookReview, fields: [], path: [] },
      { entity: Book, fields: ["author"], path: ["reviews"] },
      { entity: Author, fields: ["firstName", "lastName"], path: ["books", "reviews"] },
    ]);
  });

  it("can do parent and grand-parent primitive field names", () => {
    expect(
      reverseReactiveHint(BookReview, BookReview, { book: { title: {}, author: ["firstName", "lastName"] } }),
    ).toEqual([
      { entity: BookReview, fields: [], path: [] },
      { entity: Book, fields: ["title", "author"], path: ["reviews"] },
      { entity: Author, fields: ["firstName", "lastName"], path: ["books", "reviews"] },
    ]);
  });

  it("can do child o2m with primitive field names", () => {
    expect(reverseReactiveHint(Author, Author, { books: "title" })).toEqual([
      // Include the Author so that if no books are added, the rule still rules on create
      { entity: Author, fields: [], path: [] },
      { entity: Book, fields: ["author", "title"], path: ["author"] },
    ]);
  });

  it("can do child o2m with w/o any fields", () => {
    expect(reverseReactiveHint(Author, Author, "books")).toEqual([
      { entity: Author, fields: [], path: [] },
      { entity: Book, fields: ["author"], path: ["author"] },
    ]);
  });

  it("can do child o2o with primitive field names", () => {
    expect(reverseReactiveHint(Author, Author, { image: "fileName" })).toEqual([
      { entity: Author, fields: [], path: [] },
      { entity: Image, fields: ["author", "fileName"], path: ["author"] },
    ]);
  });

  it("can do child m2m with primitive field names", () => {
    expect(reverseReactiveHint(Book, Book, { tags: "name" })).toEqual([
      { entity: Book, fields: ["tags"], path: [] },
      { entity: Tag, fields: ["books", "name"], path: ["books"] },
    ]);
  });

  it("can do nested child m2m with primitive field names", () => {
    expect(reverseReactiveHint(Author, Author, { books: { tags: "name" } })).toEqual([
      { entity: Author, fields: [], path: [] },
      { entity: Book, fields: ["author", "tags"], path: ["author"] },
      { entity: Tag, fields: ["books", "name"], path: ["books", "author"] },
    ]);
  });

  it("can do via polymorphic reference", () => {
    expect(reverseReactiveHint(Author, Author, { books: { comments: "text" } })).toEqual([
      { entity: Author, fields: [], path: [] },
      { entity: Book, fields: ["author"], path: ["author"] },
      { entity: Comment, fields: ["parent", "text"], path: ["parent@Book", "author"] },
    ]);
  });

  it("skips read-only m2o parents", () => {
    expect(reverseReactiveHint(Book, Book, { author_ro: "firstName:ro" })).toEqual([
      { entity: Book, fields: [], path: [] },
    ]);
  });

  it("skips read-only o2m children and grand-children", () => {
    expect(reverseReactiveHint(Author, Author, { books_ro: "reviews:ro", firstName_ro: {} })).toEqual([
      { entity: Author, fields: [], path: [] },
    ]);
  });

  it("can do read-only string hint", () => {
    // expect(reverseHint(Author, "books:ro")).toEqual([{ entity: Book, fields: ["author"], path: ["author"] }]);
    expect(reverseReactiveHint(Author, Author, "publisher:ro")).toEqual([{ entity: Author, fields: [], path: [] }]);
  });

  it("can do array of read-only string hints", () => {
    expect(reverseReactiveHint(Author, Author, ["firstName:ro", "publisher:ro"])).toEqual([
      { entity: Author, fields: [], path: [] },
    ]);
  });

  it("can do hash of read-only hints", () => {
    // TODO Enforce that `name` must be `name:ro`
    expect(reverseReactiveHint(Author, Author, { publisher_ro: "name:ro" })).toEqual([
      { entity: Author, fields: [], path: [] },
    ]);
    expect(reverseReactiveHint(BookReview, BookReview, { book: "author:ro" })).toEqual([
      { entity: BookReview, fields: [], path: [] },
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

    it("works with persisted derived fields", () => {
      expect(convertToLoadHint(getMetadata(BookReview), { isPublic: {} })).toStrictEqual({ isPublic: {} });
      expect(convertToLoadHint(getMetadata(BookReview), { isPublic_ro: {} })).toStrictEqual({ isPublic: {} });
    });

    it("does not squash multiple expanded hints", () => {
      // Given one Author hasReactiveAsyncProperty that goes through publisher -> comments
      expect(convertToLoadHint(am, ["latestComment2"])).toEqual({
        publisher: { comments: {} },
        comments: {},
      });
      // And another Author hasReactiveAsyncProperty that goes through publisher -> authors
      expect(convertToLoadHint(am, ["allPublisherAuthorNames"])).toEqual({
        publisher: { authors: {} },
      });
      // When we access both of them at the same time, then the hints are merged
      expect(convertToLoadHint(am, ["latestComment2", "allPublisherAuthorNames"])).toEqual({
        publisher: { authors: {}, comments: {} },
        comments: {},
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

    function passLoadedToReacted() {
      // Given a function that wants a Reacted subview of Author
      function calcAuthor(author: Reacted<Author, { firstName: {}; books: "title" }>): void {}
      // When we have a Loaded author
      const a1: Loaded<Author, "books"> = null!;
      // Then we can call it
      calcAuthor(a1);
    }

    function cannotPassPartiallyLoadedToReacted() {
      // Given a function that wants a Reacted subview of Author
      function calcAuthor(author: Reacted<Author, { firstName: {}; books: "title" }>): void {}
      // When we have a Loaded author, but books is not loaded
      const a1: Loaded<Author, "publisher"> = null!;
      // Then we cannot call it
      // @ts-expect-error
      calcAuthor(a1);
    }
  });
});
