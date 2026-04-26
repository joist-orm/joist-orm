import { AsyncProperty, hasReactiveAsyncProperty } from "joist-orm";
import { LargePublisherCodegen } from "./entities";

import { largePublisherConfig as config } from "./entities";

export class LargePublisher extends LargePublisherCodegen {
  /**
   * Subtype-specific override of `commentParentInfo` whose hint mentions LP-only relations.
   * Used to catch CTI-subtype reactive-hint contamination in `addRule`/`addReaction`'s
   * closure-cached `loadHint`.
   */
  readonly commentParentInfo: AsyncProperty<LargePublisher, string> = hasReactiveAsyncProperty(
    { critics: [] },
    () => "lp",
  );
}

/** Test that subtype defaults can override base class defaults and are processed and persisted */
config.setDefault("baseSyncDefault", () => "LPSyncDefault");
config.setDefault("baseAsyncDefault", "authors", () => "LPAsyncDefault");
