import { LargePublisherCodegen } from "./entities";

import { largePublisherConfig as config } from "./entities";

export class LargePublisher extends LargePublisherCodegen {}

/** Test that subtype defaults can override base class defaults and are processed and persisted */
config.setDefault("baseSyncDefault", () => "LPSyncDefault");
config.setDefault("baseAsyncDefault", "authors", () => "LPAsyncDefault");
