import { hasPersistedAsyncProperty } from "joist-orm";

class Author {
  count = hasPersistedAsyncProperty({ books: "reviews" }, () => {});
}
