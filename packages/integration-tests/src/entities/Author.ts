import { EntityManager } from "joist-orm";
import { AuthorCodegen, AuthorOpts } from "./entities";

export class Author extends AuthorCodegen {
  constructor(em: EntityManager, opts: AuthorOpts) {
    super(em, opts);
  }

  /** Implements the business logic for a (synchronous) derived primitive. */
  get initials(): string {
    return this.firstName[0] + (this.lastName !== undefined ? this.lastName[0] : "");
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

  protected onSave(): void {
    if (this.firstName && this.firstName === this.lastName) {
      throw new Error("firstName and lastName must be different");
    }
  }
}
