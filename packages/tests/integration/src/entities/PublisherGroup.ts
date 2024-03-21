import { PublisherGroupCodegen } from "./entities";

import { hasReactiveField, ReactiveField } from "joist-orm";
import { publisherGroupConfig as config } from "./entities";

export class PublisherGroup extends PublisherGroupCodegen {
  readonly numberOfBookReviews: ReactiveField<PublisherGroup, number> = hasReactiveField(
    "numberOfBookReviews",
    { publishers: "numberOfBookReviews" },
    (p) => p.publishers.get.map((p) => p.numberOfBookReviews.get).reduce((a, b) => a + b, 0),
  );
}

// remove once you have actual rules/hooks
config.placeholder();
