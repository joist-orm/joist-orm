import { type ReactiveField, hasReactiveField } from "joist-orm";

import { BookCodegen } from "./entities";

export class Book extends BookCodegen {
  // For testing ReactiveFields that ergonomically persist int ids
  readonly authorIdSnapshot: ReactiveField<Book, number | undefined> = hasReactiveField(
    "author",
    (book) => book.author.get.idDb,
  );
}
