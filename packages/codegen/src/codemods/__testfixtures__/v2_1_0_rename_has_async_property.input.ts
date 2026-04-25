import {
  AsyncProperty,
  hasAsyncProperty,
  hasReactiveAsyncProperty,
  isAsyncProperty,
  isLoadedAsyncProperty,
} from "joist-core";

class Author {
  count: AsyncProperty<Author, number> = hasAsyncProperty({ books: "title" }, (a) => a.books.get.length);
  reactive: AsyncProperty<Author, number> = hasReactiveAsyncProperty({ books: "title" }, (a) => a.books.get.length);
}

function check(maybe: any) {
  if (isAsyncProperty(maybe) && isLoadedAsyncProperty(maybe)) {
    return maybe.get;
  }
}
