import {
  Property,
  hasAsyncProperty,
  hasAsyncReactiveField,
  isAsyncProperty,
  isLoadedAsyncProperty,
  isLoadedAsyncReactiveField,
  isAsyncReactiveField,
  ReactiveField,
} from "joist-orm";
import { AsyncPropertyImpl } from "joist-orm/build/relations/AsyncProperty";
import { AsyncReactiveFieldImpl } from "joist-orm/build/relations/AsyncReactiveField";
export { isAsyncReactiveField } from "joist-orm/build/relations/AsyncReactiveField";

class Publisher {
  numberOfAuthors: Property<Publisher, number> = hasAsyncProperty((p) => p.countAuthors());
  numberOfBookReviews: ReactiveField<Publisher, number> = hasAsyncReactiveField(
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
  if (isAsyncProperty(maybe) && isLoadedAsyncProperty(maybe)) {
    return maybe.get;
  }
  if (isAsyncReactiveField(maybe) && isLoadedAsyncReactiveField(maybe)) {
    return maybe.get;
  }
  if (maybe instanceof AsyncPropertyImpl || maybe instanceof AsyncReactiveFieldImpl) {
    return maybe.get;
  }
}
