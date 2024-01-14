// @ts-ignore
import { hasReactiveField, ReactiveField } from "joist-orm";

class Author {
  // @ts-ignore
  count: ReactiveField<Author, void> = hasReactiveField({ books: "reviews" }, () => {});
}
