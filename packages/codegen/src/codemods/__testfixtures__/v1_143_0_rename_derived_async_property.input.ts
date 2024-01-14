import { hasPersistedAsyncProperty, PersistedAsyncProperty } from "joist-orm";

class Author {
  count: PersistedAsyncProperty<Author, void> = hasPersistedAsyncProperty({ books: "reviews" }, () => {});
}
