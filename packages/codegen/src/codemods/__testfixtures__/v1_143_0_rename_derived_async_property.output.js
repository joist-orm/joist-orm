import { hasReactiveField } from "joist-orm";

class Author {
  count = hasReactiveField({ books: "reviews" }, () => {});
}
