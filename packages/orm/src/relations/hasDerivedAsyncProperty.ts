import { Entity } from "../Entity";
import { Const, currentlyInstantiatingEntity } from "../EntityManager";
import { getMetadata } from "../EntityMetadata";
import { setField } from "../index";
import { convertToLoadHint, Reacted, ReactiveHint } from "../reactiveHints";

const I = Symbol();

/**
 * A `DerivedAsyncProperty` is a value that is derived from other entities/values,
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
export interface DerivedAsyncProperty<T extends Entity, V> {
  isLoaded: boolean;

  /** Calculates the latest derived value. */
  load(): Promise<V>;

  /** If loaded, returns the latest derived value, or if unload returns the previously-calculated value. */
  get: V;

  [I]?: T;
}

/**
 * Creates a calculated derived value from a load hint + lambda.
 *
 * The property can be accessed by default as a promise, with `someProperty.load()`.
 *
 * But if `someProperty` is used as a populate hint, then it can be accessed synchronously,
 * with `someProperty.get`.
 */
export function hasDerivedAsyncProperty<T extends Entity, H extends ReactiveHint<T>, V>(
  fieldName: keyof T & string,
  hint: Const<H>,
  fn: (entity: Reacted<T, H>) => V,
): DerivedAsyncProperty<T, V> {
  const entity = currentlyInstantiatingEntity as T;
  return new DerivedAsyncPropertyImpl(entity, fieldName, hint, fn);
}

export class DerivedAsyncPropertyImpl<T extends Entity, H extends ReactiveHint<T>, V>
  implements DerivedAsyncProperty<T, V>
{
  private loaded = false;
  private loadPromise: any;
  constructor(
    private entity: T,
    public fieldName: keyof T & string,
    public loadHint: Const<H>,
    private fn: (entity: Reacted<T, H>) => V,
  ) {}

  load(): Promise<V> {
    const { entity, loadHint, fn } = this;
    if (!this.loaded) {
      return (this.loadPromise ??= entity.em
        .populate(entity, convertToLoadHint(getMetadata(entity), loadHint as ReactiveHint<T>))
        .then((loaded) => {
          this.loaded = true;
          // Go through `this.get` so that `setField` is called to set our latest value
          return this.get;
        }));
    }
    return Promise.resolve(this.get);
  }

  get get(): V {
    const { entity, fn } = this;
    if (this.loaded) {
      const newValue = fn(entity as Reacted<T, H>);
      // It's cheap to set this every time we're called, i.e. even if it's not the
      // official "being called during em.flush" update.
      setField(entity, this.fieldName, newValue);
      return newValue;
    } else {
      if (this.fieldName in entity.__orm.data) {
        return entity.__orm.data[this.fieldName];
      } else {
        throw new Error(`${this.fieldName} has not been derived yet`);
      }
    }
  }

  get isLoaded() {
    return this.loaded;
  }
}

/** Type guard utility for determining if an entity field is an AsyncProperty. */
export function isDerivedAsyncProperty(maybeAsyncProperty: any): maybeAsyncProperty is DerivedAsyncProperty<any, any> {
  return maybeAsyncProperty instanceof DerivedAsyncPropertyImpl;
}

/** Type guard utility for determining if an entity field is a loaded AsyncProperty. */
export function isLoadedAsyncProperty(maybeAsyncProperty: any): maybeAsyncProperty is DerivedAsyncProperty<any, any> {
  return isDerivedAsyncProperty(maybeAsyncProperty) && maybeAsyncProperty.isLoaded;
}
