import {
  AsyncMethod,
  AsyncProperty,
  Collection,
  Loaded,
  ReactiveField,
  ReactiveGetter,
  ReactiveReference,
  Reference,
  cannotBeUpdated,
  hasAsyncMethod,
  hasAsyncProperty,
  hasManyDerived,
  hasManyThrough,
  hasOneDerived,
  hasReactiveAsyncProperty,
  hasReactiveField,
  hasReactiveGetter,
  hasReactiveReference,
  isDefined,
  withLoaded,
} from "joist-orm";
import {
  AuthorCodegen,
  Book,
  BookRange,
  BookReview,
  Comment,
  authorMeta,
  bookMeta,
  authorConfig as config,
} from "./entities";

export class Author extends AuthorCodegen {
  readonly reviews: Collection<Author, BookReview> = hasManyThrough((author) => author.books.reviews);
  readonly reviewedBooks: Collection<Author, Book> = hasManyDerived(
    { books: "reviews" },
    {
      get: (author) => author.books.get.filter((b) => b.reviews.get.length > 0),
      // set / add / remove callbacks are totally contrived to test that they work
      set: (author, values) => {
        values.forEach((book) => {
          author.reviewedBooks.add(book);
        });
        author.books.get.filter((book) => !values.includes(book)).forEach((book) => author.reviewedBooks.remove(book));
      },
      // needs a Loaded<Book, "reviews"> or will throw
      add: (author, book) => {
        const loaded = book as Loaded<Book, "reviews">;
        author.books.add(book);
        if (loaded.reviews.get.length === 0) {
          author.em.create(BookReview, { rating: 5, book });
        }
      },
      // needs a Loaded<Book, "reviews"> or will throw
      remove: (author, book) => {
        const loaded = book as Loaded<Book, "reviews">;
        loaded.reviews.get.forEach((r) => author.em.delete(r));
      },
    },
  );

  readonly latestComment: Reference<Author, Comment, undefined> = hasOneDerived(
    { publisher: "comments", comments: {} },
    (author) => author.publisher.get?.comments.get[0] ?? author.comments.get[0],
  );

  // Example of persisted property depending on another persisted property (isPublic) that is triggered off of this entity
  // as well as a non-persisted property (isPublic2) and a regular primitive (rating)
  readonly numberOfPublicReviews: ReactiveField<Author, number> = hasReactiveField(
    "numberOfPublicReviews",
    { books: { reviews: ["isPublic", "isPublic2", "rating"] } },
    (a) => {
      const reviews = a.books.get.flatMap((b) => b.reviews.get);
      const filtered = reviews.filter((r) => r.isPublic.get && r.isPublic2.get && r.rating > 0);
      return filtered.length;
    },
  );

  // Example of persisted property depending on another persisted property (isPublic) that is triggered off of this entity
  // another persisted property (isTest) that is triggered off of a related entity (Review.comment.text)
  // as well as a regular primitive (rating)
  readonly numberOfPublicReviews2: ReactiveField<Author, number> = hasReactiveField(
    "numberOfPublicReviews2",
    { books: { reviews: ["isPublic", "isTest", "rating"] } },
    (a) =>
      a.books.get.flatMap((b) => b.reviews.get).filter((r) => r.isPublic.get && !r.isTest.get && r.rating > 0).length,
  );

  readonly tagsOfAllBooks: ReactiveField<Author, string> = hasReactiveField(
    "tagsOfAllBooks",
    // Including age (as a "tag" :shrug:) to test IsLoadedCache invalidation of an immutable field, during the 1st em
    { books: { tags: "name" }, age: {} },
    (a) =>
      [
        // Include a dummy "age" tag just to make a test case possible
        ...(a.age ? [`age-${a.age}`] : []),
        ...a.books.get.flatMap((b) => b.tags.get).map((t) => t.name),
      ].join(", "),
  );

  readonly search: ReactiveField<Author, string> = hasReactiveField(
    "search",
    { books: "title", firstName: {} },
    (a) => {
      const { books } = withLoaded(a);
      return [a.id, a.firstName, ...books.map((b) => b.title)].filter(isDefined).join(" ");
    },
  );

  readonly nickNamesUpper: ReactiveField<Author, string[]> = hasReactiveField("nickNamesUpper", "nickNames", (a) =>
    (a.nickNames ?? []).map((n) => n.toUpperCase()),
  );

  public transientFields = {
    beforeFlushRan: false,
    beforeCreateRan: false,
    beforeCreateAsyncRan: false,
    beforeUpdateRan: false,
    beforeDeleteRan: false,
    afterValidationRan: false,
    beforeCommitRan: false,
    afterCommitRan: false,
    afterCommitIdIsSet: false,
    afterCommitIsNewEntity: false,
    afterCommitIsDeletedEntity: false,
    setGraduatedInFlush: false,
    firstIsNotLastNameRuleInvoked: 0,
    mentorRuleInvoked: 0,
    ageRuleInvoked: 0,
    numberOfBooksCalcInvoked: 0,
    mentorNamesCalcInvoked: 0,
    bookCommentsCalcInvoked: 0,
    favoriteBookCalcInvoked: 0,
    graduatedRuleInvoked: 0,
    deleteDuringFlush: false,
  };

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

  /** For testing `upsert` with non-field properties. */
  set fullName(fullName: string) {
    const [firstName, lastName] = fullName.split(" ");
    this.firstName = firstName;
    this.lastName = lastName;
  }

  /** For testing `upsert` with setter-only properties. */
  set fullName2(fullName: string) {
    const [firstName, lastName] = fullName.split(" ");
    this.firstName = firstName;
    this.lastName = lastName;
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
  readonly numberOfBooks: ReactiveField<Author, number> = hasReactiveField(
    "numberOfBooks",
    // Include firstName to ensure `.get` uses the load hint (and not the full reactive hint)
    // when evaluating whether to eval our lambda during pre-flush calls.
    ["books", "firstName"],
    (a) => {
      a.transientFields.numberOfBooksCalcInvoked++;
      return a.books.get.length;
    },
  );

  /** Example of a ReactiveField that uses recursive relations. */
  readonly mentorNames: ReactiveField<Author, string | undefined> = hasReactiveField(
    "mentorNames",
    { mentorsRecursive: "firstName" },
    (a) => {
      a.transientFields.mentorNamesCalcInvoked++;
      return a.mentorsRecursive.get.flatMap((m) => m.firstName).join(", ");
    },
  );

  /** Example of a derived async enum. */
  readonly rangeOfBooks: ReactiveField<Author, BookRange> = hasReactiveField("rangeOfBooks", ["books"], (a) => {
    return a.books.get.length > 10 ? BookRange.Lot : BookRange.Few;
  });

  /** Example of a derived async property that can be calculated via a populate hint through a polymorphic reference. */
  readonly bookComments: ReactiveField<Author, string> = hasReactiveField(
    "bookComments",
    // ...and throw in hasLowerCaseFirstName to test ReactiveGetters
    { books: { comments: "text" }, hasLowerCaseFirstName: {} },
    (a) => {
      a.transientFields.bookCommentsCalcInvoked++;
      return a.books.get
        .flatMap((b) => b.comments.get)
        .map((c) => c.text)
        .join(", ");
    },
  );

  readonly favoriteBook: ReactiveReference<Author, Book, undefined> = hasReactiveReference(
    bookMeta,
    "favoriteBook",
    // The 'cache invalidates transitive RFs' test in ReactiveField.test.ts relies on BookReview.rating
    // changes triggering a `favoriteBook` to recalc, to exercise transitive RF recalcs. This is fine,
    // but we've thought about `reviews_ro` short-circuiting the reactivity, so we might have to update
    // this test, if we do end up having this short-circuit.
    { books: { reviews_ro: "rating" } },
    (a) => {
      a.transientFields.favoriteBookCalcInvoked++;
      const books = a.books.get;
      if (books.length === 0) {
        return undefined;
      }
      const ratings = books.flatMap((b) => b.reviews.get).map((r) => r.rating);
      if (ratings.length === 0) return books[0];
      const bestRating = Math.max(...ratings);
      return books.find((b) => b.reviews.get.some((r) => r.rating === bestRating));
    },
  );

  // should add two RFs for favoriteBookTagNames & rootMentorNumberOfBooks to show reactivity across RRs

  // For testing ReactiveReferences in entities with recursive relations
  readonly rootMentor: ReactiveReference<Author, Author, undefined> = hasReactiveReference(
    authorMeta,
    "rootMentor",
    "mentorsRecursive",
    (a) => {
      const value = a.mentorsRecursive.get[a.mentorsRecursive.get.length - 1];
      return value;
    },
  );

  /** Example of an async property that can be loaded via a populate hint. */
  readonly numberOfBooks2: AsyncProperty<Author, number> = hasReactiveAsyncProperty({ books: "title" }, (a) => {
    // Use the title to test reactivity to an hasReactiveAsyncProperty calc changing
    return a.books.get.filter((b) => b.title !== "Ignore").length;
  });

  /** Example of an async property that returns an entity. */
  readonly latestComment2: AsyncProperty<Author, Comment | undefined> = hasReactiveAsyncProperty(
    { publisher: "comments", comments: {} },
    (author) => author.publisher.get?.comments.get[0] ?? author.comments.get[0],
  );

  /** Example of an async property that has a conflicting/overlapping reactive hint with ^. */
  readonly allPublisherAuthorNames: AsyncProperty<Author, string | undefined> = hasReactiveAsyncProperty(
    { publisher: { authors: "firstName" } },
    (author) => author.publisher.get?.authors.get.flatMap((a) => a.firstName).join(),
  );

  /** Example of an async property that returns a list of entities. */
  readonly latestComments: AsyncProperty<Author, Comment[]> = hasAsyncProperty(
    { publisher: "comments", comments: {} },
    (author) => [...(author.publisher.get?.comments.get ?? []), ...author.comments.get],
  );

  /** For testing reacting to poly CommentParent properties. */
  readonly commentParentInfo: AsyncProperty<Author, string> = hasReactiveAsyncProperty(
    "numberOfBooks",
    (a) => `books=${a.numberOfBooks.get}`,
  );

  readonly booksWithTitle: AsyncMethod<Author, [string], Book[]> = hasAsyncMethod("books", (a, title) =>
    // Include silly `title.trim().length > 0` check to ensure we're not called during `populate`
    title.trim().length > 0 ? a.books.get.filter((b) => b.title.includes(title)) : [],
  );

  // Example of an AsyncMethod without params, i.e. for a calc that we only want calculated when
  // explicitly called, vs. AsyncProperties that implicitly call `.get` whenever loaded.
  readonly booksTitles: AsyncMethod<Author, [], string> = hasAsyncMethod("books", (a) =>
    a.books.get.map((b) => b.title).join(", "),
  );

  // Example of a reactive getter that can always be gotten
  readonly hasLowerCaseFirstName: ReactiveGetter<Author, boolean> = hasReactiveGetter(
    "hasLowerCaseFirstName",
    "firstName",
    (a) => a.firstName.toLowerCase() === a.firstName,
  );
}

config.cascadeDelete("books");
config.cascadeDelete("image");

// Example of a simple rule that runs on every flush
config.addRule((a) => {
  a.transientFields.firstIsNotLastNameRuleInvoked++;
  if (a.firstName && a.firstName === a.lastName) {
    return "firstName and lastName must be different";
  }
});

// Example of a rule returning a field and code
config.addRule((a) => {
  if (a.lastName === "NotAllowedLastName") {
    return { code: "invalid-name", field: "lastName", message: "lastName is invalid" };
  }
});

// Example of a reactive rule returning a field and code
config.addRule("lastName", (a) => {
  if (!a.isNewEntity) {
    return { code: "invalid-name", field: "lastName", message: "lastName cannot be changed" };
  }
});

// Example of returning multiple validation errors as string[]
config.addRule((a) => {
  if (a.firstName === "very bad") {
    return ["First Name is invalid one", "First Name is invalid two"];
  }
});

// Example of returning multiple validation errors as { message: string }[]
// Nov 2023: I don't remember why/if we're using this format vs. just raw string[]s
config.addRule((a) => {
  if (a.firstName === "very bad message") {
    return [{ message: "First Name is invalid one" }, { message: "First Name is invalid two" }];
  }
});

// Example of reactive rule being fired on Book change
config.addRule({ books: ["title"], firstName: {} }, (a) => {
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
  a.transientFields.mentorRuleInvoked++;
});

// Example of rule that is run when set-via-hook field runs
config.addRule("graduated", (a) => {
  a.transientFields.graduatedRuleInvoked++;
});

// Example of cannotBeUpdated
config.addRule(cannotBeUpdated("age"));

// Example of a rule against an immutable field
config.addRule("age", (a) => {
  a.transientFields.ageRuleInvoked++;
});

config.cascadeDelete("books");

// For testing cross-entity default dependencies, i.e. for Book.notes
config.setDefault(
  "nickNames", // Reusing `nickNames` which is also used for testing `string[]` columns
  ["publisher", "firstName"], // Add a dummy load hint to make this async, so it doesn't just run-first for free
  (a) => [a.firstName],
);

// Example accessing ctx from beforeFlush
config.beforeFlush(async (author, ctx) => {
  await ctx.makeApiCall("Author.beforeFlush");
});

// Example setting a field during flush
config.beforeFlush(async (author) => {
  author.transientFields.beforeFlushRan = true;
  if (author.transientFields.setGraduatedInFlush) {
    author.graduated = new Date();
  }
});

// Example deleting during a flush
config.beforeFlush(async (author, { em }) => {
  if (author.transientFields.deleteDuringFlush) {
    em.delete(author);
  }
});

config.beforeCreate((author) => {
  author.transientFields.beforeCreateRan = true;
});

config.beforeCreate((author) => {
  author.transientFields.beforeCreateAsyncRan = true;
  return Promise.resolve("testing not void");
});

config.beforeUpdate((author) => {
  author.transientFields.beforeUpdateRan = true;
});

config.afterValidation((author) => {
  author.transientFields.afterValidationRan = true;
});

config.beforeDelete((author) => {
  author.transientFields.beforeDeleteRan = true;
});

config.beforeCommit((author) => {
  author.transientFields.beforeCommitRan = true;
});

config.afterCommit((author) => {
  // make sure we're still a new entity even though the id has been set
  author.transientFields.afterCommitRan = true;
  author.transientFields.afterCommitIdIsSet = author.id !== undefined;
  author.transientFields.afterCommitIsNewEntity = author.isNewEntity;
  author.transientFields.afterCommitIsDeletedEntity = author.isDeletedEntity;
});

config.addConstraintMessage("authors_publisher_id_unique_index", "There is already a publisher with a Jim");
