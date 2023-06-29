import {
  AsyncProperty,
  cannotBeUpdated,
  Collection,
  getEm,
  hasAsyncProperty,
  hasManyDerived,
  hasManyThrough,
  hasOneDerived,
  hasPersistedAsyncProperty,
  hasPersistedAsyncReference,
  Loaded,
  PersistedAsyncProperty,
  PersistedAsyncReference,
  Reference,
} from "joist-orm";
import { hasReactiveAsyncProperty } from "joist-orm/build/src/relations/hasAsyncProperty";
import { AuthorCodegen, authorConfig as config, Book, bookMeta, BookReview, Comment } from "./entities";
export class Author extends AuthorCodegen {
  readonly reviews: Collection<Author, BookReview> = hasManyThrough((author) => author.books.reviews);
  readonly reviewedBooks: Collection<Author, Book> = hasManyDerived({ books: "reviews" }, {
    get: (author) => author.books.get.filter((b) => b.reviews.get.length > 0),
    // set / add / remove callbacks are totally contrived to test that they work
    set: (author, values) => {
      values.forEach((book) => {
        this.reviewedBooks.add(book);
      });
      author.books.get.filter((book) => !values.includes(book)).forEach((book) => author.reviewedBooks.remove(book));
    },
    // needs a Loaded<Book, "reviews"> or will throw
    add: (author, book) => {
      const loaded = (book as Loaded<Book, "reviews">);
      author.books.add(book);
      if (loaded.reviews.get.length === 0) {
        author.em.create(BookReview, { rating: 5, book });
      }
    },
    // needs a Loaded<Book, "reviews"> or will throw
    remove: (author, book) => {
      const loaded = (book as Loaded<Book, "reviews">);
      loaded.reviews.get.forEach((r) => getEm(author).delete(r));
    },
  });
  readonly latestComment: Reference<Author, Comment, undefined> = hasOneDerived(
    { publisher: "comments", comments: {} },
    (author) => author.publisher.get?.comments.get[0] ?? author.comments.get[0],
  );
  // Example of persisted property depending on another persisted property (isPublic)
  // as well as a non-persisted property (isPublic2) and a regular primitive (rating)
  readonly numberOfPublicReviews: PersistedAsyncProperty<Author, number> = hasPersistedAsyncProperty(
    "numberOfPublicReviews",
    { books: { reviews: ["isPublic", "isPublic2", "rating"] } },
    (a) =>
      a.books.get.flatMap((b) => b.reviews.get).filter((r) => r.isPublic.get && r.isPublic2.get && r.rating > 0).length,
  );
  public beforeFlushRan = false;
  public beforeCreateRan = false;
  public beforeUpdateRan = false;
  public beforeDeleteRan = false;
  public afterValidationRan = false;
  public afterCommitRan = false;
  public afterCommitIdIsSet = false;
  public afterCommitIsNewEntity = false;
  public afterCommitIsDeletedEntity = false;
  public setGraduatedInFlush?: boolean;
  public mentorRuleInvoked = 0;
  public ageRuleInvoked = 0;
  public numberOfBooksCalcInvoked = 0;
  public bookCommentsCalcInvoked = 0;
  public graduatedRuleInvoked = 0;
  public deleteDuringFlush = false;

  /** Example of using populate within an entity on itself. */
  get withLoadedBooks(): Promise<Loaded<Author, "books">> {
    return this.populate("books");
  }

  /** Implements the business logic for a (synchronous) persisted derived value. */
  get initials(): string {
    return (this.firstName || "")[0] + (this.lastName !== undefined ? this.lastName[0] : "");
  }

  /** Implements the business logic for an unpersisted derived value. */
  get fullName(): string {
    return this.firstName + (this.lastName ? ` ${this.lastName}` : "");
  }
  get isPopular(): boolean | undefined {
    return super.isPopular;
  }

  /** Implements a public API for controlling access to a protected field (`wasEverPopular`). */
  set isPopular(isPopular: boolean | undefined) {
    super.isPopular = isPopular;
    // Testing protected fields
    if (isPopular && !this.wasEverPopular) {
      super.setWasEverPopular(true);
    }
  }

  /** Example of an async boolean that can be navigated via a lens. */
  async hasBooks(): Promise<boolean> {
    return (await this.books.load()).length > 0;
  }

  /** Example of a derived async property that can be calculated via a populate hint. */
  readonly numberOfBooks: PersistedAsyncProperty<Author, number> = hasPersistedAsyncProperty(
    "numberOfBooks",
    // Include firstName to ensure `.get` uses the load hint (and not the full reactive hint)
    // when evaluating whether to eval our lambda during pre-flush calls.
    ["books", "firstName"],
    (a) => {
      a.entity.numberOfBooksCalcInvoked++;
      return a.books.get.length;
    },
  );

  /** Example of a derived async property that can be calculated via a populate hint through a polymorphic reference. */
  readonly bookComments: PersistedAsyncProperty<Author, string> = hasPersistedAsyncProperty("bookComments", {
    books: { comments: "text" },
  }, (a) => {
    a.entity.bookCommentsCalcInvoked++;
    return a.books.get.flatMap((b) => b.comments.get).map((c) => c.text).join(", ");
  });
  readonly favoriteBook: PersistedAsyncReference<Author, Book, undefined> = hasPersistedAsyncReference(
    bookMeta,
    "favoriteBook",
    { books: { reviews_ro: "rating" } },
    (a) => {
      const books = a.books.get;
      if (books.length === 0) {
        return undefined;
      }
      const bestRating = Math.max(...books.flatMap((b) => b.reviews.get).map((r) => r.rating));
      return (books.find((b) => b.reviews.get.some((r) => r.rating === bestRating)) as Book | undefined);
    },
  );

  /** Example of an async property that can be loaded via a populate hint. */
  readonly numberOfBooks2: AsyncProperty<Author, number> = hasReactiveAsyncProperty({ books: "title" }, (a) => {
    // Use the title to test reactivity to an hasReactiveAsyncProperty calc changing
    return a.books.get.filter((b) => b.title !== "Ignore").length;
  });

  /** Example of an async property that returns an entity. */
  readonly latestComment2: AsyncProperty<Author, Comment | undefined> = hasReactiveAsyncProperty({
    publisher: "comments",
    comments: {},
  }, (author) => author.publisher.get?.comments.get[0].entity ?? author.comments.get[0].entity);

  /** Example of an async property that has a conflicting/overlapping reactive hint with ^. */
  readonly allPublisherAuthorNames: AsyncProperty<Author, string | undefined> = hasReactiveAsyncProperty({
    publisher: { authors: "firstName" },
  }, (author) => author.publisher.get?.authors.get.flatMap((a) => a.firstName).join());

  /** Example of an async property that returns a list of entities. */
  readonly latestComments: AsyncProperty<Author, Comment[]> = hasAsyncProperty(
    { publisher: "comments", comments: {} },
    (author) => [...(author.publisher.get?.comments.get ?? []), ...author.comments.get],
  );
}
config.cascadeDelete("books");
config.cascadeDelete("image");
config.addRule((a) => {
  if (a.firstName && a.firstName === a.lastName) {
    return "firstName and lastName must be different";
  }
});
config.addRule((a) => {
  if (a.lastName === "NotAllowedLastName") {
    return "lastName is invalid";
  }
});
config.addRule((a) => {
  if (!a.isNewEntity && a.changes.lastName.hasChanged) {
    return "lastName cannot be changed";
  }
});

// Example of reactive rule being fired on Book change
config.addRule({ books: ["title"], firstName: {} }, async (a) => {
  if (a.books.get.length > 0 && a.books.get.find((b) => b.title === a.firstName)) {
    return "A book title cannot be the author's firstName";
  }
});

// Example of reactive rule being fired on Book insertion/deletion
config.addRule("books", (a) => {
  if (a.books.get.length === 13) {
    return "An author cannot have 13 books";
  }
});

// Example of rule that is always run even if the field is not set
config.addRule("mentor", (a) => {
  a.entity.mentorRuleInvoked++;
});

// Example of rule that is run when set-via-hook field runs
config.addRule("graduated", (a) => {
  a.entity.graduatedRuleInvoked++;
});

// Example of cannotBeUpdated
config.addRule(cannotBeUpdated("age"));

// Example of a rule against an immutable field
config.addRule("age", (a) => {
  a.entity.ageRuleInvoked++;
});
config.cascadeDelete("books");

// Example accessing ctx from beforeFlush
config.beforeFlush(async (author, ctx) => {
  await ctx.makeApiCall("Author.beforeFlush");
});

// Example setting a field during flush
config.beforeFlush(async (author) => {
  author.beforeFlushRan = true;
  if (author.setGraduatedInFlush) {
    author.graduated = new Date();
  }
});

// Example deleting during a flush
config.beforeFlush(async (author, { em }) => {
  if (author.deleteDuringFlush) {
    em.delete(author);
  }
});
config.beforeCreate((author) => {
  author.beforeCreateRan = true;
});
config.beforeUpdate((author) => {
  author.beforeUpdateRan = true;
});
config.afterValidation((author) => {
  author.afterValidationRan = true;
});
config.beforeDelete((author) => {
  author.beforeDeleteRan = true;
});
config.afterCommit((author) => {
  // make sure we're still a new entity even though the id has been set
  author.afterCommitRan = true;
  author.afterCommitIdIsSet = author.id !== undefined;
  author.afterCommitIsNewEntity = author.isNewEntity;
  author.afterCommitIsDeletedEntity = author.isDeletedEntity;
});
config.addConstraintMessage("authors_publisher_id_unique_index", "There is already a publisher with a Jim");
