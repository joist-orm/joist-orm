import {
  AsyncQueryProperty,
  hasAsyncQueryProperty,
  hasReactiveQueryField,
  isAsyncQueryProperty,
  isLoadedAsyncQueryProperty,
  isLoadedReactiveQueryField,
  isReactiveQueryField,
  ReactiveField,
} from "joist-orm";
import { AsyncQueryPropertyImpl } from "joist-orm/build/relations/hasAsyncQueryProperty";
import { ReactiveQueryFieldImpl } from "joist-orm/build/relations/ReactiveQueryField";
export { isReactiveQueryField } from "joist-orm/build/relations/ReactiveQueryField";

class Publisher {
  numberOfAuthors: AsyncQueryProperty<Publisher, number> = hasAsyncQueryProperty((p) => p.countAuthors());
  numberOfBookReviews: ReactiveField<Publisher, number> = hasReactiveQueryField(
    "id",
    { authors: { books: "reviews" } },
    (p) => p.countBookReviews(),
  );

  countAuthors(): Promise<number> {
    return Promise.resolve(0);
  }

  countBookReviews(): Promise<number> {
    return Promise.resolve(0);
  }
}

function check(maybe: unknown) {
  if (isAsyncQueryProperty(maybe) && isLoadedAsyncQueryProperty(maybe)) {
    return maybe.get;
  }
  if (isReactiveQueryField(maybe) && isLoadedReactiveQueryField(maybe)) {
    return maybe.get;
  }
  if (maybe instanceof AsyncQueryPropertyImpl || maybe instanceof ReactiveQueryFieldImpl) {
    return maybe.get;
  }
}
