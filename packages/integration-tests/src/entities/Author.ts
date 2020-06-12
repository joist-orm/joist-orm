import { Collection, CustomCollection, Entity, EntityManager, getEm, Loaded, LoadHint } from "joist-orm";
import { AuthorCodegen, authorConfig, AuthorOpts, Book, BookReview } from "./entities";

type Test<T extends Entity, U extends Loaded<T, LoadHint<T>>> = {
  herp: (em: EntityManager) => Promise<U>;
  derp: (test: U) => void;
};

const test: Test<Author, Loaded<Author, { books: "reviews" }>> = {
  herp: async (em) => await em.load(Author, "1", { books: "reviews" }),
  derp: (test) => {},
};

export class Author extends AuthorCodegen {
  public beforeFlushRan = false;
  public beforeDeleteRan = false;
  public afterCommitRan = false;
  public ageForBeforeFlush?: number;

  readonly reviews: Collection<Author, BookReview> = new CustomCollection<Author, BookReview, undefined>(
    this,
    "reviews",
    {
      load: async (author) => await getEm(author).populate(author, { books: "reviews" }),
      get: (author) =>
        (author as Loaded<Author, { books: "reviews" }>).books.get.flatMap((b) => b.reviews.get) as BookReview[],
      add: (author, other) => {
        getEm(author).create(Book, { title: "a new book", author, reviews: [other] });
      },
    },
  );

  readonly reviewsWithoutCallbacks: Collection<Author, BookReview> = new CustomCollection<
    Author,
    BookReview,
    undefined
  >(this, "reviewsWithoutCallbacks", {
    load: async (author) => (await getEm(author).populate(author, { books: "reviews" })) as Loaded<Author, any>,
    get: (author: Loaded<Author, { books: "reviews" }>) => author.books.get.flatMap((b) => b.reviews.get),
  });

  constructor(em: EntityManager, opts: AuthorOpts) {
    super(em, opts);
  }

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

authorConfig.beforeFlush((author) => {
  author.beforeFlushRan = true;
  if (author.ageForBeforeFlush !== undefined) {
    author.age = author.ageForBeforeFlush;
  }
});

authorConfig.beforeDelete((author) => {
  author.beforeDeleteRan = true;
});

authorConfig.afterCommit((author) => {
  author.afterCommitRan = true;
});

authorConfig.setAsyncDerivedField("numberOfBooks", "books", (author) => {
  return author.books.get.length;
});
