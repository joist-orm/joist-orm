import { AuthorCodegen } from "./codegen/AuthorCodegen";

export class Author extends AuthorCodegen {
  get fullName(): string {
    return `${this.firstName} ${this.lastName || ""}`.trim();
  }
}
