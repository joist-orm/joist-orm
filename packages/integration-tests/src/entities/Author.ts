import { EntityManager, ValidationError } from "joist-orm";
import { AuthorCodegen, AuthorOpts, Book } from "./entities";

export class Author extends AuthorCodegen {
  constructor(em: EntityManager, opts: AuthorOpts) {
    super(em, opts);

    this.addRule(() => {
      if (this.firstName && this.firstName === this.lastName) {
        return "firstName and lastName must be different";
      }
    });

    this.addRule(() => {
      if (this.lastName === "NotAllowedLastName") {
        return "lastName is invalid";
      }
    });

    this.addRule(() => {
      if (this.hasChanged.lastName) {
        return "lastName cannot be changed";
      }
    });

    this.addRule(async () => {
      const books = await this.books.load();
      if (books.length > 0 && books.find((b) => b.title === this.firstName)) {
        return "A book title cannot be the author's firstName";
      }
    });
  }

  /** Implements the business logic for a (synchronous) derived primitive. */
  get initials(): string {
    return (this.firstName || "")[0] + (this.lastName !== undefined ? this.lastName[0] : "");
  }

  get fullName(): string {
    return this.firstName + (this.lastName ? ` ${this.lastName}` : "");
  }

  set isPopular(isPopular: boolean | undefined) {
    super.isPopular = isPopular;
    // Testing protected fields
    if (isPopular && !this.wasEverPopular) {
      super.setWasEverPopular(true);
    }
  }
}
