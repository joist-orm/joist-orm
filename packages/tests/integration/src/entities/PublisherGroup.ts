import { BookReview, PublisherGroupCodegen, smallPublisherBeforeFlushRan } from "./entities";

import { hasReactiveField, hasReactiveQueryField, ReactiveField } from "joist-orm";
import { publisherGroupConfig as config } from "./entities";

export class PublisherGroup extends PublisherGroupCodegen {
  transientFields = { smallPublisherBeforeFlushRan: false };

  readonly numberOfBookReviews: ReactiveField<PublisherGroup, number> = hasReactiveField(
    "numberOfBookReviews",
    { publishers: "numberOfBookReviews" },
    (p) => p.publishers.get.map((p) => p.numberOfBookReviews.get).reduce((a, b) => a + b, 0),
  );

  readonly numberOfBookReviewsFormatted: ReactiveField<PublisherGroup, string> = hasReactiveQueryField(
    "numberOfBookReviewsFormatted",
    {},
    { publishers: { authors: { books: "reviews" } } },
    async (pg) => {
      const count = await pg.em.findCount(BookReview, {
        book: { author: { publisher: { group: pg.fullNonReactiveAccess } } },
      });
      return `count=${count}`;
    },
  );
}

// For testing cross-entity hook ordering
config.beforeFlush((b) => {
  b.transientFields.smallPublisherBeforeFlushRan = smallPublisherBeforeFlushRan.value;
});

// For testing sync defaults on ReactiveQueryFields
config.setDefault("numberOfBookReviewsFormatted", () => {
  // Using a random value to simulate a field with unique constraints but it's not actually important to this test
  return new Date().toString();
});
