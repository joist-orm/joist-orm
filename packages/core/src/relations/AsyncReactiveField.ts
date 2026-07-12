import { Entity } from "../Entity";
import { getMetadata } from "../EntityMetadata";
import { getField, isFieldSet, setField } from "../fields";
import { ReactiveField, deepNormalizeHint, isLoaded } from "../index";
import { lazyField } from "../newEntity";
import { Reacted, ReactiveHint, convertToLoadHint } from "../reactiveHints";
import { mergeNormalizedHints } from "../utils";
import { AbstractPropertyImpl } from "./AbstractPropertyImpl";
import { PropertyT } from "./hasProperty";

/**
 * An `AsyncReactiveField` is a value that is derived from a SQL query, similar to
 * a `ReactiveField`, but when the value needs to be calculated from SQL because
 * it would be too expensive to calculate in-memory.
 *
 * Its hint is split in two: the `loadHint` names data that is both reacted-to *and*
 * loaded into memory (and passed to `fn`), while the `reactiveHint` names data that is
 * only reacted-to (its changes recompute the value) but is left in the database rather
 * than pulled into memory. The `fn` lambda re-runs when data referred to by either hint
 * changes, but only the `loadHint`'s data is populated.
 */
export function hasAsyncReactiveField<
  T extends Entity,
  const H1 extends ReactiveHint<T>,
  const H2 extends ReactiveHint<T>,
  V,
>(loadHint: H1, reactiveHint: H2, fn: (entity: Reacted<T, H1>) => Promise<V>): ReactiveField<T, V> {
  return lazyField((entity: T, fieldName) => {
    return new AsyncReactiveFieldImpl(entity, fieldName as keyof T & string, loadHint, reactiveHint, fn);
  });
}

export class AsyncReactiveFieldImpl<T extends Entity, H1 extends ReactiveHint<T>, H2 extends ReactiveHint<T>, V>
  extends AbstractPropertyImpl<T>
  implements ReactiveField<T, V>
{
  readonly #loadHint: H1;
  readonly #reactiveHint: H2;
  #loadPromise: any;
  #loaded: boolean;
  #useFactoryValue = false;

  constructor(
    entity: T,
    public fieldName: keyof T & string,
    loadHint: H1,
    reactiveHint: H2,
    private fn: (entity: Reacted<T, H1>) => Promise<V>,
  ) {
    super(entity);
    this.#loadHint = loadHint;
    this.#reactiveHint = reactiveHint;
    this.#loaded = false;
  }

  /**
   * Our combined load + reactive-only hint, so that we react to changes within both.
   *
   * The `loadHint` half is populated into memory (and passed to `fn`); the `reactiveHint`
   * half only triggers recalculation, so its data stays in the database.
   */
  get reactiveHint(): ReactiveHint<any> {
    // We do this in a getter (instead of the constructor) b/c it might be a little expensive,
    // and I'm pretty sure this is only called on boot, when hooking up the reactivity.
    const hint = deepNormalizeHint(this.#loadHint);
    mergeNormalizedHints(hint, deepNormalizeHint(this.#reactiveHint));
    return hint;
  }

  load(opts?: { forceReload?: boolean }): Promise<V> {
    // if (!this.isSet || opts?.forceReload) {
    return (this.#loadPromise ??= this.entity.em
      .populate(this.entity, { hint: this.loadHint } as any)
      .then(() => {
        // Even if the factory used a `with...`, we'll still go through the RFQ logic, but just ignore the new value
        return this.#useFactoryValue ? this.fieldValue : this.fn(this.entity as Reacted<T, H1>);
      })
      .then((newValue) => {
        setField(this.entity, this.fieldName, newValue);
        this.#loadPromise = undefined;
        this.#loaded = true;
        return newValue;
      })
      .catch((e) => {
        // If we blow up calling `this.fn` i.e. due to a NoIdError, we want to make
        // sure that the next `.load` call tries again.
        this.#loadPromise = undefined;
        throw e;
      }));
    // }
    // return tryResolve(() => this.get);
  }

  /** Returns the previously-calculated value. */
  get get(): V {
    // Regular ReactiveFields repeatedly call their `fn` lambda to calculate the value, to ensure
    // they always return the latest/correct value, but because AsyncReactiveFields are fundamentally
    // calculated from DB queries, we can only return the previously-calculated value, if set.
    if (this.isSet) {
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
    const hintLoaded = isLoaded(this.entity, this.loadHint);
    if (hintLoaded) {
      this.#loaded = true;
    }
    return hintLoaded;
  }

  get loadHint(): any {
    // Only convert the loadHint, so we don't pull the reactiveHint-referenced data into memory
    const meta = getMetadata(this.entity);
    return (meta.config.__data.cachedReactiveLoadHints[this.fieldName] ??= convertToLoadHint(meta, this.#loadHint));
  }

  setFactoryValue(newValue: any): void {
    this.#useFactoryValue = true;
    setField(this.entity, this.fieldName, newValue);
  }

  [PropertyT] = undefined as any as T;
}

/** Type guard utility for determining if an entity field is an AsyncReactiveField. */
export function isAsyncReactiveField(maybe: any): maybe is ReactiveField<any, any> {
  return maybe instanceof AsyncReactiveFieldImpl;
}

/** Type guard utility for determining if an entity field is a loaded AsyncReactiveField. */
export function isLoadedAsyncReactiveField(maybe: any): maybe is ReactiveField<any, any> {
  return isAsyncReactiveField(maybe) && maybe.isLoaded;
}
