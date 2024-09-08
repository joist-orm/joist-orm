import { AsyncProperty, hasReactiveAsyncProperty } from "joist-orm";
import { criticConfig as config, CriticCodegen, PublisherGroup } from "./entities";

export class Critic extends CriticCodegen {
  // For testing returning Reacted<...> from hasReactiveAsyncProperty
  readonly filteredGroup: AsyncProperty<Critic, PublisherGroup | undefined> = hasReactiveAsyncProperty(
    "group",
    (c) => c.group.get,
  );
}

/** For testing walking through subtype relations. */
config.addRule({ favoriteLargePublisher: "images" }, () => {});
