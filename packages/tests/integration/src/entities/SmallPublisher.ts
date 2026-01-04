import {
  cannotBeUpdated,
  ConfigApi,
  hasReactiveField,
  hasReactiveReference,
  ManyToOneReference,
  ReactiveField,
  ReactiveReference,
} from "joist-orm";
import { Context } from "src/context";
import {
  Author,
  authorMeta,
  smallPublisherConfig as config,
  Entity,
  PublisherGroup,
  publisherTransientFields,
  SmallPublisherCodegen,
} from "./entities";

// For testing an interface that is used on a subtype, with a relation from the base type
type HasGroup<T extends Entity> = {
  get group(): ManyToOneReference<T, PublisherGroup, undefined>;
};

export const smallPublisherBeforeFlushRan = { value: false };

export class SmallPublisher extends SmallPublisherCodegen implements HasGroup<SmallPublisher> {
  static afterMetadataHasBaseTypes = false;
  transientFields = {
    ...publisherTransientFields,
    beforeFlushRan: false,
    beforeCreateRan: false,
    beforeUpdateRan: false,
    beforeDeleteRan: false,
    afterValidationRan: false,
    afterCommitRan: false,
  };

  // Used for testing a derived property that only exists on a subtype
  readonly allAuthorNames: ReactiveField<SmallPublisher, string> = hasReactiveField({ authors: ["firstName"] }, (sp) =>
    sp.authors.get.map((a) => a.firstName).join(", "),
  );

  /** Example of a ReactiveReference in an entity with subtypes. */
  readonly favoriteAuthor: ReactiveReference<SmallPublisher, Author, undefined> = hasReactiveReference(
    authorMeta,
    "favoriteAuthor",
    { authors: "books" },
    (p) => {
      // Prefer authors with the least books (swapped a - b)
      return [...p.authors.get].sort((a, b) => a.books.get.length - b.books.get.length)[0];
    },
  );
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
  sp.transientFields.beforeFlushRan = true;
});

config.beforeCreate((sp) => {
  sp.transientFields.beforeCreateRan = true;
});

config.beforeUpdate((sp) => {
  sp.transientFields.beforeUpdateRan = true;
});

config.afterValidation((sp) => {
  sp.transientFields.afterValidationRan = true;
});

config.beforeDelete((sp) => {
  sp.transientFields.beforeDeleteRan = true;
});

config.afterCommit((sp) => {
  sp.transientFields.afterCommitRan = true;
});

// add a default for city in such a way that scanEntities won't pick it up so that we can test overriding defaults
// via config
function addCityDefault(config: ConfigApi<SmallPublisher, Context>) {
  config["setDefault"]("city", "default city");
}

addCityDefault(config);
