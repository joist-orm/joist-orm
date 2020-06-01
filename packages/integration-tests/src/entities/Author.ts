import { EntityManager, Loaded } from "joist-orm";
import { AuthorCodegen, authorConfig, AuthorOpts, Book } from "./entities";

export class Author extends AuthorCodegen {
  public beforeFlushRan = false;
  public afterCommitRan = false;

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
}

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

authorConfig.addRule("books", async (a) => {
  if (a.books.get.length > 0 && a.books.get.find((b) => b.title === a.firstName)) {
    return "A book title cannot be the author's firstName";
  }
});

authorConfig.beforeFlush((author) => {
  author.beforeFlushRan = true;
});

authorConfig.afterCommit((author) => {
  author.afterCommitRan = true;
});

authorConfig.setAsyncDerivedField("numberOfBooks", "books", (author) => {
  return author.books.get.length;
});
