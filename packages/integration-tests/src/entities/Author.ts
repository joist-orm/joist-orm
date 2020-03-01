import { EntityManager } from "joist-orm";
import { AuthorCodegen, AuthorOpts } from "./entities";

export class Author extends AuthorCodegen {
  constructor(em: EntityManager, opts: AuthorOpts) {
    super(em, opts);
  }

  get fullName(): string {
    return this.firstName + (this.lastName ? ` ${this.lastName}` : "");
  }

  protected onSave(): void {
    if (this.firstName && this.firstName === this.lastName) {
      throw new Error("firstName and lastName must be different");
    }
  }
}
