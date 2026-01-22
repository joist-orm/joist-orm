import { hasReactiveField, ReactiveField } from "joist-core";

class Author {
  count: ReactiveField<Author, void> = hasReactiveField({ books: "reviews" }, () => {});
}

// make sure we support this new syntax
const a = 1 satisfies number;
