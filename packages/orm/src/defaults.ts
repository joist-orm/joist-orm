import { Deferred } from "joist-utils";
import { Entity } from "./Entity";
import { EntityMetadata, EnumField, getBaseAndSelfMetas, getMetadata, PrimitiveField } from "./EntityMetadata";
import { setField } from "./fields";
import { normalizeHint } from "./normalizeHints";
import { convertToLoadHint, ReactiveHint } from "./reactiveHints";
import { isLoadedReference } from "./relations/index";
import { fail, failIfAnyRejected } from "./utils";

export function hasDefaultValue(meta: EntityMetadata, fieldName: string): boolean {
  return getBaseAndSelfMetas(meta).some(
    (m) => fieldName in m.config.__data.syncDefaults || fieldName in m.config.__data.asyncDefaults,
  );
}

/** Run the sync defaults for `entity`. */
export function setSyncDefaults(entity: Entity): void {
  const meta = getMetadata(entity);
  // Allow subtypes to override base setDefaults
  const syncDefaults: Record<string, any> = getBaseAndSelfMetas(meta).reduce(
    (acc, m) => ({ ...acc, ...m.config.__data.syncDefaults }),
    {},
  );
  for (const [fieldName, maybeFn] of Object.entries(syncDefaults)) {
    const value = (entity as any)[fieldName];
    const field = meta.allFields[fieldName];
    // Use allFields in case a subtype sets a default for one of its base fields
    if (
      (field.kind === "primitive" || field.kind === "enum") &&
      (field as PrimitiveField | EnumField).derived === "async"
    ) {
      // If this is a ReactiveQueryField, we want to push in a default, but setOpts is called
      // from the codegen constructor, so the user-defined `hasReactiveQueryField` fields will
      // not have been initialized yet (i.e. `entity[field]` will be undefined and not yet an
      // `instanceof ReactiveQueryField`). Thankfully we can just use setField.
      setField(entity, fieldName, maybeFn);
    } else if (value === undefined) {
      (entity as any)[fieldName] = maybeFn instanceof Function ? maybeFn(entity) : maybeFn;
    } else if (isLoadedReference(value) && !value.isSet) {
      // A sync default usually would never be for a reference, because reference defaults usually
      // require a field hint (so would be async) to get "the other entity". However, something like:
      // `config.setDefault("original", (self) => self);` is technically valid.
      value.set(maybeFn instanceof Function ? maybeFn(entity) : maybeFn);
    }
  }
}

/** Runs the async defaults for all inserted entities in `todos`. */
export async function setAsyncDefaults(
  suppressedTypeErrors: Error[],
  ctx: unknown,
  // We want this to be per-subtype, so that a subtype can have its own default, and we still invoke
  // the subtype `setOnEntities(...all subtype entities...)` and `setOnEntities(...any base types...)`
  // as bulk calls.
  insertsBySubType: Map<EntityMetadata, Entity[]>,
): Promise<void> {
  const dt = new DependencyTracker(insertsBySubType);
  const results = await Promise.allSettled(
    [...insertsBySubType.entries()].flatMap(([meta, inserts]) => {
      // configure will have copy/pasted base defaults into our config, so we can loop over it directly
      return Object.values(meta.config.__data.asyncDefaults).map((df) =>
        df.setOnEntities(ctx, dt, suppressedTypeErrors, meta, inserts),
      );
    }),
  );
  failIfAnyRejected(results);
}

/** Sets async defaults *synchronously*, only safe for factories with `DeepNew` entities. */
export function setAsyncDefaultsSynchronously(ctx: unknown, entity: Entity): void {
  // configure will have copy/pasted base defaults into our config, so we can loop over it directly
  for (const df of Object.values(getMetadata(entity).config.__data.asyncDefaults)) {
    df.setOnFactoryEntity(ctx, entity);
  }
}

/** Wraps the hint + lambda of an async `setDefault`. */
export class AsyncDefault<T extends Entity> {
  readonly fieldName: string;
  readonly fieldHint: ReactiveHint<T>;
  readonly fn: (entity: any, ctx: any) => any;
  #loadHint: any;
  // We can't calc this until post-boot because it requires following metadata
  #deps: DefaultDependency[] | undefined;

  constructor(fieldName: string, fieldHint: ReactiveHint<T>, fn: (entity: T, ctx: any) => any) {
    this.fieldName = fieldName;
    this.fieldHint = fieldHint;
    this.fn = fn;
  }

  /** Given a list of inserts of the same type/subtype, set ourselves on each of them. */
  async setOnEntities(
    ctx: any,
    dt: DependencyTracker,
    suppressedTypeErrors: Error[],
    baseMetadata: EntityMetadata,
    inserts: T[],
  ): Promise<any> {
    try {
      // Ensure our dependencies have been set
      // (...and only wait on dependencies that are actively being calculated)
      const deps = this.deps(baseMetadata).filter((dep) => dt.hasMaybePending(dep.meta));
      if (deps.length > 0) {
        // console.log(
        //   "WAITING ON",
        //   deps.map((dep) => `${dep.meta.type}.${dep.fieldName}`),
        //   `FOR ${baseMetadata.type}.${this.fieldName}`,
        // );
        // deps promises shouldn't reject, so we should be fine w/o allSettled here
        await Promise.all(deps.map((dep) => dt.getDeferred(dep.meta, dep.fieldName).promise));
      }
      // Run our default for all entities, use allSettled to avoid leaving lambdas running if one fails
      const results = await Promise.allSettled(
        inserts
          .map(async (entity) => {
            const value = (entity as any)[this.fieldName];
            if (value === undefined) {
              (entity as any)[this.fieldName] = await this.getValue(entity, ctx);
            } else if (isLoadedReference(value) && !value.isSet) {
              value.set(await this.getValue(entity, ctx));
            }
          })
          .map((promise) =>
            promise.catch((reason) => {
              // If we NPE-d because a required field wasn't set, hold on to this and
              // let the validation failures reject the `em.flush` instead of us
              if (reason instanceof TypeError) {
                suppressedTypeErrors.push(reason);
              } else {
                throw reason;
              }
            }),
          ),
      );
      failIfAnyRejected(results);
    } finally {
      // Mark ourselves as complete (from a `finally` just in case our `setDefault`
      // blows up, we don't forever block the other defaults waiting on us).
      // console.log(`FINISHED ${baseMetadata.type}.${this.fieldName}`);
      dt.getDeferred(baseMetadata, this.fieldName).resolve();
    }
  }

  setOnFactoryEntity(ctx: unknown, entity: T): void {
    // If the lambda uses the `async` keyword, it definitely makes a promise, so don't invoke it
    // from a synchronous factory call.
    if (this.fn.constructor.name === "AsyncFunction") return;
    const value = (entity as any)[this.fieldName];
    try {
      if (value === undefined || (isLoadedReference(value) && !value.isSet)) {
        const val = this.fn(entity, ctx);
        // Even though we checked `async () => ...` above, a lambda could still return a Promise
        if (val instanceof Promise) {
          throw new Error(
            `Use the \`async\` keyword for the setDefault "${this.fieldName}" function that returns a Promise`,
          );
        } else {
          if (isLoadedReference(value)) {
            value.set(val);
          } else {
            (entity as any)[this.fieldName] = val;
          }
        }
      }
    } catch (e) {
      // It's likely common to get NPEs/TypeErrors from speculatively executing defaults
      // pre-em.flush, i.e. we don't have the DependencyTracker/etc infra here, the lambdas
      // could do a `book.author.get.name` and NPE on the `author.get.name`. So instead just
      // suppress errors and assume `em.flush` will try again.
      // ...we need to add a NotLoadedError
      // if (!(e instanceof TypeError || e instanceof NotL)) {
      //   throw e;
      // }
    }
  }

  /** For the given `entity`, returns what the default value should be. */
  private getValue(entity: T, ctx: any): Promise<any> {
    // We can't convert this until now, since it requires the `metadata`
    this.#loadHint ??= convertToLoadHint(getMetadata(entity), this.fieldHint);
    return entity.em.populate(entity, this.#loadHint).then((loaded) => this.fn(loaded, ctx));
  }

  // Calc once and cache
  private deps(meta: EntityMetadata): DefaultDependency[] {
    return (this.#deps ??= getDefaultDependencies(meta, this.fieldName, this.fieldHint));
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
  baseMeta: EntityMetadata<T>,
  baseFieldName: string,
  baseHint: ReactiveHint<T>,
): DefaultDependency[] {
  // Ensure the hint is an `{ ... }`
  const deps: DefaultDependency[] = [];
  const todo: [meta: EntityMetadata, hint: ReactiveHint<any>][] = [[baseMeta, normalizeHint(baseHint)]];
  while (todo.length !== 0) {
    const [meta, hint] = todo.pop()!;
    for (const [fieldName, nestedHint] of Object.entries(hint)) {
      const field = meta.allFields[fieldName];
      // Super naive circular dependency detection
      const isSameField = meta === baseMeta && fieldName === baseFieldName;
      if (isSameField) continue;
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
  // Create a map "entityType -> fieldName -> deferred"
  #deferreds = new Map<string, Map<string, Deferred<void>>>();

  constructor(insertsBySubType: Map<EntityMetadata, Entity[]>) {
    // Seed it with any entities that we're actively inserting (as any dependencies to
    // entities that aren't even having `setDefault` called can be skipped)
    for (const meta of [...insertsBySubType.keys()]) {
      this.#deferreds.set(meta.type, new Map());
    }
  }

  hasMaybePending(meta: EntityMetadata): boolean {
    return this.#deferreds.has(meta.type) ?? false;
  }

  getDeferred(meta: EntityMetadata, fieldName: string): Deferred<void> {
    const map = this.#deferreds.get(meta.type) ?? fail(`No deferred check necessary for ${meta.type}.${fieldName}`);
    let deferred = map.get(fieldName);
    if (!deferred) {
      deferred = new Deferred();
      map.set(fieldName, deferred);
    }
    return deferred;
  }
}
