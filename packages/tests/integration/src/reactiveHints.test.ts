import { Author, Book, BookReview, Comment, Critic, Publisher, PublisherGroup, User } from "@src/entities";
import {
  Entity,
  LoadHint,
  Loaded,
  MaybeAbstractEntityConstructor,
  Reacted,
  ReactiveHint,
  ReactiveTarget,
  convertToLoadHint,
  getMetadata,
  reverseReactiveHint,
} from "joist-orm";

const am = getMetadata(Author);

describe("reactiveHints", () => {
  it("can do immediate primitive field names", () => {
    expect(reverse(Author, Author, "firstName")).toEqual([{ entity: "Author", fields: ["firstName"], path: [] }]);
  });

  it("can do parent primitive field names", () => {
    expect(reverse(Book, Book, { author: ["firstName", "lastName"] })).toEqual([
      { entity: "Book", fields: ["author"], path: [] },
      { entity: "Author", fields: ["firstName", "lastName"], path: ["books"] },
    ]);
  });

  it("can do grand-parent primitive field names", () => {
    expect(reverse(BookReview, BookReview, { book: { author: ["firstName", "lastName"] } })).toEqual([
      { entity: "BookReview", fields: [], path: [] },
      { entity: "BookReview", kind: "read-only", fields: ["book"], path: [] },
      { entity: "Book", fields: ["author"], path: ["reviews"] },
      { entity: "Author", fields: ["firstName", "lastName"], path: ["books", "reviews"] },
    ]);
  });

  it("can do parent and grand-parent primitive field names", () => {
    expect(reverse(BookReview, BookReview, { book: { title: {}, author: ["firstName", "lastName"] } })).toEqual([
      { entity: "BookReview", fields: [], path: [] },
      { entity: "BookReview", kind: "read-only", fields: ["book"], path: [] },
      { entity: "Book", fields: ["title", "author"], path: ["reviews"] },
      { entity: "Author", fields: ["firstName", "lastName"], path: ["books", "reviews"] },
    ]);
  });

  it("can do parent that is soft-deleted", () => {
    expect(reverse(PublisherGroup, PublisherGroup, { publishers: "name" })).toEqual([
      { entity: "PublisherGroup", fields: [], path: [] },
      { entity: "Publisher", fields: ["group", "deletedAt", "name"], path: ["group"] },
    ]);
  });

  it("can do child o2m with primitive field names", () => {
    expect(reverse(Author, Author, { books: "title" })).toEqual([
      // Include the Author so that if no books are added, the rule still rules on create
      { entity: "Author", fields: [], path: [] },
      { entity: "Book", fields: ["author", "deletedAt", "title"], path: ["author"] },
    ]);
  });

  it("can do child o2m with w/o any fields", () => {
    expect(reverse(Author, Author, "books")).toEqual([
      { entity: "Author", fields: [], path: [] },
      { entity: "Book", fields: ["author", "deletedAt"], path: ["author"] },
    ]);
  });

  it("can do immutable child o2m with w/o any fields", () => {
    // Unlike the previous test, BookReview.book has a cannotBeUpdated
    expect(reverse(Book, Book, "reviews")).toEqual([
      { entity: "Book", fields: [], path: [] },
      // Make sure this update rule is created
      { entity: "BookReview", fields: [], path: ["book"] },
      { entity: "BookReview", kind: "read-only", fields: ["book"], path: ["book"] },
    ]);
  });

  it("can do child o2o with primitive field names", () => {
    expect(reverse(Author, Author, { image: "fileName" })).toEqual([
      { entity: "Author", fields: [], path: [] },
      { entity: "Image", fields: ["author", "fileName"], path: ["author"] },
    ]);
  });

  it("can do child m2m with primitive field names", () => {
    expect(reverse(Book, Book, { tags: "name" })).toEqual([
      { entity: "Book", fields: ["tags"], path: [] },
      { entity: "Tag", fields: ["name"], path: ["books"] },
    ]);
  });

  it("can do nested child m2m with primitive field names", () => {
    expect(reverse(Author, Author, { books: { tags: "name" } })).toEqual([
      { entity: "Author", fields: [], path: [] },
      { entity: "Book", fields: ["author", "deletedAt", "tags"], path: ["author"] },
      { entity: "Tag", fields: ["name"], path: ["books", "author"] },
    ]);
  });

  it("can reactive directly to a ReactiveReference", () => {
    // We're allowed to react directly to favoriteAuthor changing...
    expect(reverse(Publisher, Publisher, { favoriteAuthor: {} })).toEqual([
      { entity: "Publisher", fields: ["favoriteAuthor"], path: [] },
    ]);
    // And read-only fields within it
    expect(reverse(Publisher, Publisher, { favoriteAuthor: "firstName_ro" })).toEqual([
      { entity: "Publisher", fields: ["favoriteAuthor"], path: [] },
      { entity: "Author", kind: "read-only", fields: ["firstName"], path: ["favoriteAuthorPublishers"] },
    ]);
    // As well as both fields being read-only
    expect(reverse(Publisher, Publisher, { favoriteAuthor_ro: "firstName:ro" })).toEqual([
      { entity: "Publisher", fields: [], path: [] },
      { entity: "Publisher", kind: "read-only", fields: ["favoriteAuthor"], path: [] },
      { entity: "Author", kind: "read-only", fields: ["firstName"], path: ["favoriteAuthorPublishers"] },
    ]);
    // But we cannot have non-read-only submit
    expect(() => reverse(Publisher, Publisher, { favoriteAuthor_ro: "firstName" })).toThrow(
      "Invalid hint in Publisher.ts",
    );
  });

  it("can do ReactiveReferences through a o2o", () => {
    expect(reverse(Publisher, Publisher, { authors: { favoriteBook: "title" } })).toEqual([
      { entity: "Publisher", fields: [], path: [] },
      { entity: "Author", fields: ["publisher", "deletedAt", "favoriteBook"], path: ["publisher"] },
      { entity: "Book", fields: ["title"], path: ["favoriteAuthor", "publisher"] },
    ]);
  });

  it("can do via polymorphic reference", () => {
    expect(reverse(Author, Author, { books: { comments: "text" } })).toEqual([
      { entity: "Author", fields: [], path: [] },
      { entity: "Book", fields: ["author", "deletedAt"], path: ["author"] },
      { entity: "Comment", fields: ["parent", "text"], path: ["parent@Book", "author"] },
    ]);
  });

  it("can do recursive relations", () => {
    expect(reverse(Author, Author, { mentorsRecursive: "firstName" })).toEqual([
      { entity: "Author", fields: ["mentor"], path: [] },
      { entity: "Author", fields: ["mentor"], path: ["menteesRecursive"] },
      { entity: "Author", fields: ["firstName"], path: ["menteesRecursive"] },
    ]);
    expect(reverse(Book, Book, { author: { mentorsRecursive: { publisher: "name" } } })).toEqual([
      { entity: "Book", fields: ["author"], path: [] },
      // When `a2.mentor = a1`, any `a2.books` would see a1 in their `b1.author.mentorsRecursive` collection.
      // When `a2.mentor` changes to `a3`, we *could* recalc through `a3.menteesRecursive`, but that would over
      // fetch, so instead we (as a new mentee) ping our books directly + our own mentees.
      { entity: "Author", fields: ["mentor"], path: ["books"] },
      { entity: "Author", fields: ["mentor"], path: ["menteesRecursive", "books"] },
      // When I am the mentor, and my publisher changes, tell my mentee's books
      { entity: "Author", fields: ["publisher"], path: ["menteesRecursive", "books"] },
      // When I am the Publisher, tell my authors, who if they're mentors, will tell their mentees
      // (which will get us to the `author` level in the hint, to invalidate their books.)
      { entity: "Publisher", fields: ["name"], path: ["authors", "menteesRecursive", "books"] },
    ]);
  });

  it("can do recursive m2m relations", () => {
    expect(reverse(User, User, { parentsRecursive: "name" })).toEqual([
      // When my parents m2m collection changes, recalc me
      { entity: "User", fields: ["parents"], path: [] },
      // When a parent's parents m2m changes, walk down through childrenRecursive to find affected users
      { entity: "User", fields: ["parents"], path: ["childrenRecursive"] },
      // When a parent's name changes, walk down through childrenRecursive
      { entity: "User", fields: ["name"], path: ["childrenRecursive"] },
    ]);
  });

  it("can do via subtype-only poly relation", () => {
    // User.favoritePublisher is a poly, so filter on LargePublisher to avoid smallPublisher.critics
    expect(reverse(Critic, Critic, { favoriteLargePublisher: "users" })).toEqual([
      { entity: "Critic", fields: ["favoriteLargePublisher"], path: [] },
      { entity: "User", fields: ["favoritePublisher"], path: ["favoritePublisher@LargePublisher", "critics"] },
    ]);
  });

  it("can do via subtype-only m2o relation", () => {
    // Image.publisher points to any publishers, so filter on LargePublisher to avoid smallPublisher.critics
    expect(reverse(Critic, Critic, { favoriteLargePublisher: "images" })).toEqual([
      { entity: "Critic", fields: ["favoriteLargePublisher"], path: [] },
      { entity: "Image", fields: ["publisher"], path: ["publisher@LargePublisher", "critics"] },
    ]);
  });

  it("can do via subtype-only o2m relation", () => {
    // PublisherGroup.publishers points to any publishers, so filter on LargePublisher to avoid smallPublisher.critics
    expect(reverse(Critic, Critic, { favoriteLargePublisher: { group: "publishers" } })).toEqual([
      { entity: "Critic", fields: ["favoriteLargePublisher"], path: [] },
      { entity: "LargePublisher", fields: ["group"], path: ["critics"] },
      { entity: "Publisher", fields: ["group", "deletedAt"], path: ["group", "publishers@LargePublisher", "critics"] },
    ]);
  });

  it("can do via subtype-only m2m relation", () => {
    // Tag.publishers points to any publishers, so filter on LargePublisher to avoid smallPublisher.critics
    expect(reverse(Critic, Critic, { favoriteLargePublisher: { tags: "name" } })).toEqual([
      { entity: "Critic", fields: ["favoriteLargePublisher"], path: [] },
      { entity: "LargePublisher", fields: ["tags"], path: ["critics"] },
      { entity: "Tag", fields: ["name"], path: ["publishers@LargePublisher", "critics"] },
    ]);
  });

  it("skips read-only m2o parents", () => {
    expect(reverse(Book, Book, { author_ro: "firstName:ro" })).toEqual([
      { entity: "Book", fields: [], path: [] },
      { entity: "Book", kind: "read-only", fields: ["author"], path: [] },
      { entity: "Author", kind: "read-only", fields: ["firstName"], path: ["books"] },
    ]);
  });

  it("skips read-only o2m children and grand-children", () => {
    expect(
      reverse(Author, Author, {
        // o2m -> another o2m, we shouldn't see `update` hints for either of these
        books_ro: "reviews:ro",
        // o2m -> field, we shouldn't see `update` hint but a read-only hint is expected
        comments_ro: "text_ro",
        firstName_ro: {},
      }),
    ).toEqual([
      { entity: "Author", fields: [], path: [] },
      { entity: "Author", kind: "read-only", fields: ["firstName"], path: [] },
      // Ensure that `author` is here to do IsLoadedCache invalidation
      { entity: "Book", kind: "read-only", fields: ["author", "deletedAt"], path: ["author"] },
      // Ensure that `book` is here to do IsLoadedCache invalidation
      { entity: "BookReview", kind: "read-only", fields: ["book"], path: ["book", "author"] },
      { entity: "Comment", kind: "read-only", fields: ["parent", "text"], path: ["parent@Author"] },
    ]);
  });

  it("can do read-only string hint", () => {
    expect(reverse(Author, Author, "publisher:ro")).toEqual([
      { entity: "Author", fields: [], path: [] },
      { entity: "Author", kind: "read-only", fields: ["publisher"], path: [] },
    ]);
  });

  it("can do array of read-only string hints", () => {
    expect(reverse(Author, Author, ["firstName:ro", "publisher:ro"])).toEqual([
      { entity: "Author", fields: [], path: [] },
      { entity: "Author", kind: "read-only", fields: ["firstName", "publisher"], path: [] },
    ]);
  });

  it("includes sub hints from reactive async properties", () => {
    expect(reverse(Author, Author, "allPublisherAuthorNames")).toEqual([
      { entity: "Author", fields: [], path: [] },
      { entity: "Author", fields: ["publisher"], path: [] },
      { entity: "Author", fields: ["publisher", "deletedAt", "firstName"], path: ["publisher", "authors"] },
    ]);
  });

  it("skips subhints of reactive async properties marked as readonly", () => {
    expect(reverse(Author, Author, "allPublisherAuthorNames:ro")).toEqual([{ entity: "Author", fields: [], path: [] }]);
  });

  it("can do hash of read-only hints", () => {
    // TODO Enforce that `name` must be `name:ro`
    expect(reverse(Author, Author, { publisher_ro: "name:ro" })).toEqual([
      { entity: "Author", fields: [], path: [] },
      { entity: "Author", kind: "read-only", fields: ["publisher"], path: [] },
      { entity: "Publisher", kind: "read-only", fields: ["name"], path: ["authors"] },
    ]);
    expect(reverse(Author, Author, { publisher: "name:ro" })).toEqual([
      { entity: "Author", fields: ["publisher"], path: [] },
      { entity: "Publisher", kind: "read-only", fields: ["name"], path: ["authors"] },
    ]);
    expect(reverse(Author, Author, { publisher_ro: { group_ro: "name:ro" } })).toEqual([
      { entity: "Author", fields: [], path: [] },
      { entity: "Author", kind: "read-only", fields: ["publisher"], path: [] },
      { entity: "Publisher", kind: "read-only", fields: ["group"], path: ["authors"] },
      { entity: "PublisherGroup", kind: "read-only", fields: ["name"], path: ["publishers", "authors"] },
    ]);
    expect(reverse(Author, Author, { books_ro: { reviews_ro: "rating:ro" } })).toEqual([
      { entity: "Author", fields: [], path: [] },
      { entity: "Book", kind: "read-only", fields: ["author", "deletedAt"], path: ["author"] },
      { entity: "BookReview", kind: "read-only", fields: ["book", "rating"], path: ["book", "author"] },
    ]);
    // expect(reverse(BookReview, BookReview, { book: "author:ro" })).toEqual([
    //   { entity: "BookReview", fields: [], readOnlyFields: ["book"], path: [] },
    //   { entity: "Book", fields: [], readOnlyFields: ["author"], path: ["reviews"] },
    // ]);
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

    it("works with reactive fields", () => {
      expect(convertToLoadHint(getMetadata(BookReview), { isPublic: {} })).toStrictEqual({ isPublic: {} });
      expect(convertToLoadHint(getMetadata(BookReview), { isPublic_ro: {} })).toStrictEqual({ isPublic: {} });
    });

    it("works with reactive fields through polys with concrete relations", () => {
      expect(convertToLoadHint(getMetadata(Comment), { parent: { tags: "name" } })).toEqual({
        parent: {
          "tags@Author": {},
          "tags@Book": {},
          "tags@BookReview": {},
          "tags@Publisher": {},
          "tags@TaskOld": {},
        },
      });
    });

    it("works with reactive fields through polys with logical relations", () => {
      expect(convertToLoadHint(getMetadata(Comment), { parent: "commentParentInfo" })).toEqual({
        parent: {
          "numberOfBooks@Author": {},
          "reviews@Book": { isPublic: {} },
          "parentOldTask@TaskOld": {},
        },
      });
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

/** Calls reverseReactiveHint but swaps the entity with a string name to placate Jest. */
function reverse<T extends Entity>(
  rootType: MaybeAbstractEntityConstructor<T>,
  entityType: MaybeAbstractEntityConstructor<T>,
  hint: ReactiveHint<T>,
  reactForOtherSide?: string,
  reactForOtherSideIsReadOnly?: "field-read-only" | "hint-read-only" | false,
  isFirst: boolean = true,
): ReactiveTarget[] {
  return reverseReactiveHint(rootType, entityType, hint, reactForOtherSide, reactForOtherSideIsReadOnly, isFirst).map(
    (target) => {
      (target as any).entity = target.entity.name;
      // Reduce test churn
      if (target.kind === "update") {
        delete (target as any)["kind"];
      }
      return target;
    },
  );
}
