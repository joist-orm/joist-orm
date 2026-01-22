import { hasReactiveField, ReactiveField } from "joist-orm";

class Author {
  count: ReactiveField<Author, void> = hasReactiveField({ books: "reviews" }, () => {});
}

// make sure we support this new syntax
const a = 1 satisfies number;
