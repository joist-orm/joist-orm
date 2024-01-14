import { hasReactiveField, ReactiveField } from "joist-orm";

class Author {
  count: ReactiveField<Author, void> = hasReactiveField({ books: "reviews" }, () => {});
}
