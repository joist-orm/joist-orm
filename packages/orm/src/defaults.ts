import { Entity } from "./Entity";
import { EntityMetadata, getBaseAndSelfMetas, getMetadata, PrimitiveField } from "./EntityMetadata";
import { Todo } from "./Todo";
import { setField } from "./fields";
import { normalizeHint } from "./normalizeHints";
import { convertToLoadHint, ReactiveHint } from "./reactiveHints";
import { isLoadedReference } from "./relations/index";
import { fail } from "./utils";
import { Deferred } from "./utils/Deferred";

export function hasDefaultValue(meta: EntityMetadata, fieldName: string): boolean {
  return getBaseAndSelfMetas(meta).some(
    (m) => fieldName in m.config.__data.syncDefaults || fieldName in m.config.__data.asyncDefaults,
  );
}

/** Run the sync defaults for `entity`. */
export function setSyncDefaults(entity: Entity): void {
  getBaseAndSelfMetas(getMetadata(entity)).forEach((m) => {
    for (const [field, maybeFn] of Object.entries(m.config.__data.syncDefaults)) {
      const value = (entity as any)[field];
      // Use allFields in case a subtype sets a default for one of its base fields
      if (m.allFields[field].kind === "primitive" && (m.allFields[field] as PrimitiveField)["derived"] === "async") {
        // If this is a ReactiveQueryField, we want to push in a default, but setOpts is called
        // from the codegen constructor, so the user-defined `hasReactiveQueryField` fields will
        // not have been initialized yet (i.e. `entity[field]` will be undefined and not yet an
        // `instanceof ReactiveQueryField`). Thankfully we can just use setField.
        setField(entity, field, maybeFn);
      } else if (value === undefined) {
        (entity as any)[field] = maybeFn instanceof Function ? maybeFn(entity) : maybeFn;
      } else if (isLoadedReference(value) && !value.isSet) {
        // A sync default usually would never be for a reference, because reference defaults usually
        // require a field hint (so would be async) to get "the other entity". However, something like:
        // `config.setDefault("original", (self) => self);` is technically valid.
        value.set(maybeFn instanceof Function ? maybeFn(entity) : maybeFn);
      }
    }
  });
}

/** Runs the async defaults for all inserted entities in `todos`. */
export function setAsyncDefaults(
  suppressedTypeErrors: Error[],
  ctx: unknown,
  todos: Record<string, Todo>,
): Promise<unknown> {
  const dt = new DependencyTracker(todos);
  return Promise.all(
    Object.values(todos).flatMap((todo) =>
      // For all N of these todo.inserts, go through default
      Object.entries(todo.metadata.config.__data.asyncDefaults).map(async ([fieldName, df]) => {
        // Ensure our dependencies have ran
        // (...and only wait on dependencies that are actively being calculated)
        const deps = df.deps(todo.metadata).filter((dep) => dt.hasMaybePending(dep.meta));
        if (deps.length > 0) {
          await Promise.all(deps.map((dep) => dt.getDeferred(dep.meta, dep.fieldName).promise));
        }

        // Run our default for all entities
        await Promise.all(
          todo.inserts
            .map(async (entity) => {
              const value = (entity as any)[df.fieldName];
              if (value === undefined) {
                (entity as any)[df.fieldName] = await df.getValue(entity, ctx);
              } else if (isLoadedReference(value) && !value.isSet) {
                value.set(await df.getValue(entity, ctx));
              }
            })
            .map((promise) =>
              promise.catch((reason) => {
                if (reason instanceof TypeError) {
                  suppressedTypeErrors.push(reason);
                } else {
                  throw reason;
                }
              }),
            ),
        );

        // Mark ourselves as complete
        dt.getDeferred(todo.metadata, fieldName).resolve();
      }),
    ),
  );
}

/** Wraps the hint + lambda of an async `setDefault`. */
export class AsyncDefault<T extends Entity> {
  readonly fieldName: string;
  #fieldHint: ReactiveHint<T>;
  #loadHint: any;
  // We can't calc this until post-boot because it requires following metadata
  #deps: DefaultDependency[] | undefined;
  #fn: (entity: any, ctx: any) => any;

  constructor(fieldName: string, fieldHint: ReactiveHint<T>, fn: (entity: T, ctx: any) => any) {
    this.fieldName = fieldName;
    this.#fieldHint = fieldHint;
    this.#fn = fn;
  }

  /** For the given `entity`, returns what the default value should be. */
  getValue(entity: T, ctx: any): Promise<any> {
    // We can't convert this until now, since it requires the `metadata`
    this.#loadHint ??= convertToLoadHint(getMetadata(entity), this.#fieldHint);
    return entity.em.populate(entity, this.#loadHint).then((loaded) => this.#fn(loaded, ctx));
  }

  // Calc once and cache
  deps(meta: EntityMetadata): DefaultDependency[] {
    return (this.#deps = getDefaultDependencies(meta, this.#fieldHint));
  }
}

type DefaultDependency = {
  meta: EntityMetadata;
  fieldName: string;
};

/**
 * Given a `meta` and a nested field hint, return the meta+field tuples included within the hint.
 *
 * I.e. passing `{ author: { firstName: {}, publisher: "name" } }` would return `[[Author, "firstName"],
 * [Publisher, "name"]]`.
 */
export function getDefaultDependencies<T extends Entity>(
  meta: EntityMetadata<T>,
  hint: ReactiveHint<T>,
): DefaultDependency[] {
  // Ensure the hint is an `{ ... }`
  const deps: DefaultDependency[] = [];
  const todo: [meta: EntityMetadata, hint: ReactiveHint<any>][] = [[meta, normalizeHint(hint)]];
  while (todo.length !== 0) {
    const [meta, hint] = todo.pop()!;
    for (const [fieldName, nestedHint] of Object.entries(hint)) {
      const field = meta.allFields[fieldName];
      // If this is an invalid hint, just ignore it, and assume someone else will fail on it
      if (!field) continue;
      switch (field.kind) {
        case "enum":
        case "primitive":
          if (field.default === "config" && fieldName in meta.config.__data.asyncDefaults) {
            deps.push({ meta, fieldName });
          }
          break;
        case "m2o":
          if (field.default === "config" && fieldName in meta.config.__data.asyncDefaults) {
            deps.push({ meta, fieldName });
          }
          if (nestedHint) {
            todo.push([field.otherMetadata(), normalizeHint(nestedHint)]);
          }
          break;
        case "o2o":
        case "o2m":
        case "m2m":
          if (nestedHint) {
            todo.push([field.otherMetadata(), normalizeHint(nestedHint)]);
          }
          break;
      }
    }
  }
  return deps;
}

/**
 * This tracks cross-default dependencies that are active within a single `em.flush` loop.
 *
 * I.e. this is not a static "the Author.firstName in general depends on Publisher.whatever",
 * it tracks that we're actively inserting 10 new `Author` instances, and their `firstName`
 * default needs to wait until the `Publisher.whatever` fields have their async default
 * calculated.
 *
 * Really this is just a smaller wrapper around a map of `Deferred`s.
 */
class DependencyTracker {
  // Create a map "new entity -> fieldName -> deferred"
  #deferreds = new Map<string, Map<string, Deferred<void>>>();

  constructor(todos: Record<string, Todo>) {
    // Seed it with any entities that we're actively inserting (as any dependencies to
    // entities that aren't even having `setDefault` called can be skipped)
    for (const todo of Object.values(todos)) {
      // ...handle subtypes?
      this.#deferreds.set(todo.metadata.type, new Map());
    }
  }

  hasMaybePending(meta: EntityMetadata): boolean {
    return this.#deferreds.has(meta.type) ?? false;
  }

  getDeferred(meta: EntityMetadata, fieldName: string): Deferred<void> {
    const map = this.#deferreds.get(meta.type) ?? fail(`No deferred check necessary for ${meta.type}`);
    let deferred = map.get(fieldName);
    if (!deferred) {
      deferred = new Deferred();
      map.set(fieldName, deferred);
    }
    return deferred;
  }
}
