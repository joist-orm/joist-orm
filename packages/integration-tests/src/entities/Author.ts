import {
  AsyncProperty,
  cannotBeUpdated,
  Collection,
  getEm,
  hasAsyncProperty,
  hasManyDerived,
  hasManyThrough,
  Loaded,
} from "joist-orm";
import { AuthorCodegen, authorConfig as config, Book, BookReview } from "./entities";

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
        author.em.create(BookReview, { rating: 5, book });
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
  public afterCommitIdIsSet = false;
  public afterCommitIsNewEntity = false;
  public setGraduatedInFlush?: boolean;
  public mentorRuleInvoked = 0;
  public ageRuleInvoked = 0;

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

  /** Example of an async property that can be loaded via a populate hint. */
  readonly numberOfBooks2: AsyncProperty<Author, number> = hasAsyncProperty("books", (a) => {
    return a.books.get.length;
  });
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

// Example of cannotBeUpdated
config.addRule(cannotBeUpdated("age"));

// Example of a rule against an immutaable field
config.addRule("age", (a) => {
  a.entity.ageRuleInvoked++;
});

config.cascadeDelete("books");

config.beforeFlush(async (author, ctx) => {
  await ctx.makeApiCall("Author.beforeFlush");
  author.beforeFlushRan = true;
  if (author.setGraduatedInFlush) {
    author.graduated = new Date();
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
});

config.setAsyncDerivedField("numberOfBooks", "books", (author) => {
  return author.books.get.length;
});
