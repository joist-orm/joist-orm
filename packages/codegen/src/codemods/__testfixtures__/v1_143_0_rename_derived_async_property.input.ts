import { hasPersistedAsyncProperty, PersistedAsyncProperty } from "joist-orm";

class Author {
  count: PersistedAsyncProperty<Author, void> = hasPersistedAsyncProperty({ books: "reviews" }, () => {});
}

// make sure we support this new syntax
const a = 1 satisfies number;
