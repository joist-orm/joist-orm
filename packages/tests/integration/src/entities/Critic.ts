import { Property, hasReactiveProperty } from "joist-orm";

import { CriticCodegen, PublisherGroup, criticConfig as config } from "./entities";

export class Critic extends CriticCodegen {
  // For testing returning Reacted<...> from hasReactiveProperty
  readonly filteredGroup: Property<Critic, PublisherGroup | undefined> = hasReactiveProperty(
    "group",
    (c) => c.group.get,
  );
}

/** For testing walking through subtype relations. */
config.addRule({ favoriteLargePublisher: "images" }, () => {});
