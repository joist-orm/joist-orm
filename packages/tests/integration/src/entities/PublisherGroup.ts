import { PublisherGroupCodegen, smallPublisherBeforeFlushRan } from "./entities";

import { hasReactiveField, ReactiveField } from "joist-orm";
import { publisherGroupConfig as config } from "./entities";

export class PublisherGroup extends PublisherGroupCodegen {
  transientFields = { smallPublisherBeforeFlushRan: false };

  readonly numberOfBookReviews: ReactiveField<PublisherGroup, number> = hasReactiveField(
    "numberOfBookReviews",
    { publishers: "numberOfBookReviews" },
    (p) => p.publishers.get.map((p) => p.numberOfBookReviews.get).reduce((a, b) => a + b, 0),
  );
}

// For testing cross-entity hook ordering
config.beforeFlush((b) => {
  b.transientFields.smallPublisherBeforeFlushRan = smallPublisherBeforeFlushRan.value;
});
