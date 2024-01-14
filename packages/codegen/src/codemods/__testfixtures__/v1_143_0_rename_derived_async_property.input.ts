// @ts-ignore
import { hasPersistedAsyncProperty, PersistedAsyncProperty } from "joist-orm";

class Author {
  // @ts-ignore
  count: PersistedAsyncProperty<Author, void> = hasPersistedAsyncProperty({ books: "reviews" }, () => {});
}
