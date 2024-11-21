import { cannotBeUpdated, hasReactiveField, ManyToOneReference, ReactiveField } from "joist-orm";
import { smallPublisherConfig as config, Entity, PublisherGroup, SmallPublisherCodegen } from "./entities";

// For testing an interface that is used on a subtype, with a relation from the base type
type HasGroup<T extends Entity> = {
  get group(): ManyToOneReference<T, PublisherGroup, undefined>;
};

export const smallPublisherBeforeFlushRan = { value: false };

export class SmallPublisher extends SmallPublisherCodegen implements HasGroup<SmallPublisher> {
  // Used for testing a derived property that only exists on a subtype
  readonly allAuthorNames: ReactiveField<SmallPublisher, string> = hasReactiveField(
    "allAuthorNames",
    { authors: ["firstName"] },
    (sp) => sp.authors.get.map((a) => a.firstName).join(", "),
  );
  static afterMetadataHasBaseTypes = false;
  public beforeFlushRan = false;
  public beforeCreateRan = false;
  public beforeUpdateRan = false;
  public beforeDeleteRan = false;
  public afterValidationRan = false;
  public afterCommitRan = false;
}

config.afterMetadata((meta) => {
  SmallPublisher.afterMetadataHasBaseTypes = meta.baseTypes.length > 0;
});

// For testing `SmallPublisher.group: SmallPublisherGroup` specialization
config.addRule({ group: "smallName" }, () => {
  return [];
});

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

// Example of a rule on a subtype, against a base type field
config.addRule(cannotBeUpdated("group"));

// For testing cross-entity hook ordering
config.runHooksBefore(PublisherGroup);

// Noop rule to verify we can check both subtype & based type fields
config.beforeFlush((sp) => {
  if (sp.changes.city.hasChanged || sp.changes.name.hasChanged) {
  }
});

// For testing cross-entity hook ordering
config.beforeFlush(() => {
  smallPublisherBeforeFlushRan.value = true;
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
