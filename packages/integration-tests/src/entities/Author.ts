import { Collection, getEm, hasManyDerived, hasManyThrough, Loaded } from "joist-orm";
import { AuthorCodegen, authorConfig, Book, BookReview } from "./entities";

export class Author extends AuthorCodegen {
  readonly reviews: Collection<Author, BookReview> = hasManyThrough((author) => author.books.reviews);
  readonly reviewedBooks: Collection<Author, Book> = hasManyDerived({ books: "reviews" } as const, {
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
      const loaded = book as Loaded<Book, "reviews">;
      author.books.add(book);

      if (loaded.reviews.get.length === 0) {
        getEm(author).create(BookReview, { rating: 5, book });
      }
    },
    // needs a Loaded<Book, "reviews"> or will throw
    remove: (author, book) => {
      const loaded = book as Loaded<Book, "reviews">;
      loaded.reviews.get.forEach((r) => getEm(author).delete(r));
    },
  });

  public beforeFlushRan = false;
  public beforeCreateRan = false;
  public beforeUpdateRan = false;
  public beforeDeleteRan = false;
  public afterValidationRan = false;
  public afterCommitRan = false;
  public reactiveBeforeFlushRan = false;
  public ageForBeforeFlush?: number;

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
}

authorConfig.cascadeDelete("books");
authorConfig.cascadeDelete("image");

authorConfig.addRule((a) => {
  if (a.firstName && a.firstName === a.lastName) {
    return "firstName and lastName must be different";
  }
});

authorConfig.addRule((a) => {
  if (a.lastName === "NotAllowedLastName") {
    return "lastName is invalid";
  }
});

authorConfig.addRule((a) => {
  if (a.changes.lastName.hasChanged) {
    return "lastName cannot be changed";
  }
});

// Example of reactive rule being fired on Book change
authorConfig.addRule("books", async (a) => {
  if (a.books.get.length > 0 && a.books.get.find((b) => b.title === a.firstName)) {
    return "A book title cannot be the author's firstName";
  }
});

// Example of reactive rule being fired on Book insertion/deletion
authorConfig.addRule("books", async (a) => {
  if (a.books.get.length === 13) {
    return "An author cannot have 13 books";
  }
});

authorConfig.cascadeDelete("books");

authorConfig.beforeFlush(async (author, ctx) => {
  await ctx.makeApiCall("Author.beforeFlush");
  author.beforeFlushRan = true;
  if (author.ageForBeforeFlush !== undefined) {
    author.age = author.ageForBeforeFlush;
  }
});

authorConfig.beforeCreate((author) => {
  author.beforeCreateRan = true;
});

authorConfig.beforeUpdate((author) => {
  author.beforeUpdateRan = true;
});

authorConfig.afterValidation((author) => {
  author.afterValidationRan = true;
});

authorConfig.beforeDelete((author) => {
  author.beforeDeleteRan = true;
});

authorConfig.afterCommit((author) => {
  author.afterCommitRan = true;
});

authorConfig.reactiveBeforeFlush("mentor", { publisher: [] }, (author) => {
  // this logic is here just to ensure that MergedLoaded compiles correctly and actually does the proper loads.
  // It should be equivalent to just `author.reactiveBeforeFlushRan = true` for the test case in Author.test.ts
  author.reactiveBeforeFlushRan = author.mentor.get !== undefined && author.publisher.get === undefined;
});

authorConfig.setAsyncDerivedField("numberOfBooks", "books", (author) => {
  return author.books.get.length;
});
