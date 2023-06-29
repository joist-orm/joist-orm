import { hasPersistedAsyncProperty, PersistedAsyncProperty } from "joist-orm";
import { SmallPublisherCodegen, smallPublisherConfig as config } from "./entities";
export class SmallPublisher extends SmallPublisherCodegen {
  // Used for testing a derived property that only exists on a subtype
  readonly allAuthorNames: PersistedAsyncProperty<SmallPublisher, string> = hasPersistedAsyncProperty(
    "allAuthorNames",
    { authors: ["firstName"] },
    (sp) => sp.authors.get.map((a) => a.firstName).join(", "),
  );
  public beforeFlushRan = false;
  public beforeCreateRan = false;
  public beforeUpdateRan = false;
  public beforeDeleteRan = false;
  public afterValidationRan = false;
  public afterCommitRan = false;
}
config.addRule((p) => {
  if (p.name === "large") {
    return "name cannot be large";
  }
});

// Example of a reactive rule on a subtype
config.addRule("authors", (sp) => {
  if (sp.authors.get.length > 5) {
    return "SmallPublishers cannot have more than 5 authors";
  }
});

// Noop rule to verify we can check both subtype & based type fields
config.beforeFlush((sp) => {
  if (sp.changes.city.hasChanged || sp.changes.name.hasChanged) {
  }
});
config.beforeFlush(async (sp) => {
  sp.beforeFlushRan = true;
});
config.beforeCreate((sp) => {
  sp.beforeCreateRan = true;
});
config.beforeUpdate((sp) => {
  sp.beforeUpdateRan = true;
});
config.afterValidation((sp) => {
  sp.afterValidationRan = true;
});
config.beforeDelete((sp) => {
  sp.beforeDeleteRan = true;
});
config.afterCommit((sp) => {
  sp.afterCommitRan = true;
});
