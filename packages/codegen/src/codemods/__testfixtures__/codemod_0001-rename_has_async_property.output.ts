import {
  Property,
  hasProperty,
  hasReactiveProperty,
  isProperty,
  isLoadedProperty,
} from "joist-core";

class Author {
  constructor() {}

  count: Property<Author, number> = hasProperty({ books: "title" }, (a) => a.books.get.length);
  reactive: Property<Author, number> = hasReactiveProperty({ books: "title" }, (a) => a.books.get.length);
}

function check(maybe: unknown) {
  if (isProperty(maybe) && isLoadedProperty(maybe)) {
    return maybe.get;
  }
}
