import { currentlyInstantiatingEntity } from "../BaseEntity";
import { Entity } from "../Entity";
import { getEmInternalApi } from "../EntityManager";
import { getMetadata } from "../EntityMetadata";
import { getField, isFieldSet, setField } from "../fields";
import { isLoaded } from "../index";
import { IsLoadedCachable } from "../IsLoadedCache";
import { Reacted, ReactiveHint, convertToLoadHint } from "../reactiveHints";
import { AbstractPropertyImpl } from "./AbstractPropertyImpl";
import { AsyncPropertyT } from "./hasAsyncProperty";

/**
 * A `ReactiveField` is a value that is derived from other entities/values,
 * similar to an `AsyncProperty`, but it is also persisted in the database.
 *
 * This allows callers (or SQL queries) to access the value without first calling
 * `await load()` on the property.
 *
 * So, unlike `AsyncProperty`, `.get` is always available; if the property is unloaded,
 * then `.get` will return the last-calculated value, but if the property is loaded,
 * then it will go ahead and invoke function to calculate the latest value (i.e. so
 * that you can observe the latest & greatest value w/o waiting for `em.flush` to
 * re-calc the value while persisting to the database.
 */
export interface ReactiveField<T extends Entity, V> {
  [AsyncPropertyT]: T;
  isLoaded: boolean;
  isSet: boolean;

  /**
   * Calculates the latest derived value.
   *
   * Users are not required to call this method explicitly, as Joist will keep the
   * persisted value automatically in-sync, but if for some reason (code changes,
   * bug fixes, etc.) you need to trigger an explicit recalc, you can call `.load()`,
   * any dependent data will be loaded from the database, and the latest value
   * returned, and then later stored to the database on `em.flush`.
   *
   * Note that persisted properties used in load hints, i.e. `em.populate`s that
   * accidentally list reactive fields (instead of just relations) will not have
   * `.load()` invoked, and will instead use the previously-calculated value.
   * The rationale is that one persisted property should be able to declare its
   * dependency on another persisted property (for its reactive field-level hint)
   * without causing that dependent property's populate hint to itself be loaded.
   */
  load(opts?: { forceReload?: boolean }): Promise<V>;

  /** If loaded, returns the latest derived value, or if unload returns the previously-calculated value. */
  get: V;

  /**
   * Returns the as-of-last-flush previously-calculated value.
   *
   * This is useful if you have to purposefully avoid using the lambda to calc the latest value,
   * i.e. if you're in a test and want to watch a calculated value change from some dummy value
   * to the new derived value.
   * */
  fieldValue: V;
}

/**
 * Creates a calculated derived value from a load hint + lambda.
 *
 * The property can be accessed by default as a promise, with `someProperty.load()`.
 *
 * But if `someProperty` is used as a populate hint, then it can be accessed synchronously,
 * with `someProperty.get`.
 */
export function hasReactiveField<T extends Entity, const H extends ReactiveHint<T>, V>(
  fieldName: keyof T & string,
  hint: H,
  fn: (entity: Reacted<T, H>) => V,
): ReactiveField<T, V> {
  const entity = currentlyInstantiatingEntity as T;
  return new ReactiveFieldImpl(entity, fieldName, hint, fn);
}

export class ReactiveFieldImpl<T extends Entity, H extends ReactiveHint<T>, V>
  extends AbstractPropertyImpl<T>
  implements ReactiveField<T, V>, IsLoadedCachable
{
  readonly #reactiveHint: H;
  #loadPromise: any;
  // Initially undefined, then cached as true/false
  #isLoaded: boolean | undefined;
  #isCached: boolean | "factory-value" = false;
  constructor(
    entity: T,
    public fieldName: keyof T & string,
    public reactiveHint: H,
    private fn: (entity: Reacted<T, H>) => V,
  ) {
    super(entity);
    this.#reactiveHint = reactiveHint;
  }

  async load(opts?: { forceReload?: boolean }): Promise<V> {
    if (!this.isLoaded || opts?.forceReload) {
      // Even without `forceReload=true`, any explicit calls to `.load()` ==> ensure a fresh value,
      // because `.get` may have cached the stale/previously-calculated value.
      //
      // (Currently `em.populate` / `populateDataLoader` has a hack/escape hatch that ignores calling
      // RF.load(), to avoid pulling in the RF subgraph over using the materialized value, which ideally would be
      // replaced with us learning to do the maybeDirty approach.)
      this.#isCached = false;
      return (this.#loadPromise ??= this.entity.em.populate(this.entity, { hint: this.loadHint } as any).then(() => {
        this.#loadPromise = undefined;
        this.#isLoaded = true;
        getEmInternalApi(this.entity.em).isLoadedCache.add(this);
        // Go through `this.get` so that `setField` is called to set our latest value
        return this.get;
      }));
    }
    return this.get;
  }

  /** Returns either the latest calculated value (if loaded) or the previously-calculated value (if not loaded). */
  get get(): V {
    const { fn } = this;
    // Some ReactiveFields can have surprisingly expensive calculations, especially in loops
    // or those that invoke loops, so cache the value.
    if (this.#isCached) return this.fieldValue;
    // isLoaded will watch for our previously-loaded subgraph being mutated, and if we've
    // drifted to not-loaded, it's better to fail and tell the user.
    if (this.isLoaded) {
      const newValue = fn(this.entity as Reacted<T, H>);
      if (!getEmInternalApi(this.entity.em).isValidating) {
        // setField will immediately invalidate
        setField(this.entity, this.fieldName, newValue);
        this.#isCached = true;
        getEmInternalApi(this.entity.em).isLoadedCache.add(this);
      }
      return newValue;
    } else if (this.isSet) {
      this.#isCached = true;
      getEmInternalApi(this.entity.em).isLoadedCache.add(this);
      return this.fieldValue;
    } else {
      throw new Error(`${this.fieldName} has not been derived yet`);
    }
  }

  get fieldValue(): V {
    return getField(this.entity, this.fieldName);
  }

  get isSet() {
    return isFieldSet(this.entity, this.fieldName);
  }

  get isLoaded() {
    // Skip an expensive isLoaded(subgraph) call if no mutations have happened
    if (this.#isLoaded !== undefined) return this.#isLoaded;
    this.#isLoaded = isLoaded(this.entity, this.loadHint);
    getEmInternalApi(this.entity.em).isLoadedCache.add(this);
    return this.#isLoaded;
  }

  resetIsLoaded(): void {
    // Even though we reset this on every mutation, `isLoaded` will still realize when the subgraph
    // is still loaded (as it did before we added caching), so users won't see false positive.
    this.#isLoaded = undefined;
    // If factories asked for a hard-coded value, don't reset the cached flag
    if (this.#isCached !== "factory-value") this.#isCached = false;
  }

  get loadHint(): any {
    const meta = getMetadata(this.entity);
    return (meta.config.__data.cachedReactiveLoadHints[this.fieldName] ??= convertToLoadHint(meta, this.reactiveHint));
  }

  setFactoryValue(newValue: any): void {
    setField(this.entity, this.fieldName, newValue);
    this.#isCached = "factory-value";
  }

  [AsyncPropertyT] = undefined as any as T;
}

/** Type guard utility for determining if an entity field is an AsyncProperty. */
export function isReactiveField(maybeAsyncProperty: any): maybeAsyncProperty is ReactiveField<any, any> {
  return maybeAsyncProperty instanceof ReactiveFieldImpl;
}

/** Type guard utility for determining if an entity field is a loaded AsyncProperty. */
export function isLoadedAsyncProperty(maybeAsyncProperty: any): maybeAsyncProperty is ReactiveField<any, any> {
  return isReactiveField(maybeAsyncProperty) && maybeAsyncProperty.isLoaded;
}
