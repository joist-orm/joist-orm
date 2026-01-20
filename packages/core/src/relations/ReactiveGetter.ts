import { Entity } from "../Entity";
import { lazyField } from "../newEntity";
import { Reacted, ShallowReactiveHint } from "../reactiveHints";
import { AsyncPropertyT } from "./hasAsyncProperty";

/**
 * A `ReactiveGetter` is a getter that declares what primitive fields it depends on.
 *
 * This is very similar to a `ReactiveAsyncProperty`, except because it's limited to
 * only immediate fields on the entity, it can always have `.get` called, and doesn't
 * need to be loaded.
 *
 * The benefit over a pure getter is that `ReactiveGetter` can be used in reactive
 * rules and reactive fields, which would otherwise need to use `fullNonReactiveAccess`
 * to access getter, and risk missing reactivity.
 */
export interface ReactiveGetter<T extends Entity, V> {
  [AsyncPropertyT]: T;
  get: V;
}

/** Creates a `ReactiveGetter`, for simple "getters" that still trackable for reactivity. */
export function hasReactiveGetter<T extends Entity, const H extends ShallowReactiveHint<T>, V>(
  fieldName: keyof T & string,
  hint: H,
  fn: (entity: Reacted<T, H>) => V,
): ReactiveGetter<T, V> {
  return lazyField((entity: T, fieldName) => {
    return new ReactiveGetterImpl(entity, fieldName as keyof T & string, hint, fn);
  });
}

export class ReactiveGetterImpl<T extends Entity, const H extends ShallowReactiveHint<T>, V> implements ReactiveGetter<
  T,
  V
> {
  readonly #entity: T;
  readonly #fieldName: keyof T & string;
  readonly #hint: H;
  readonly #fn: (entity: Reacted<T, H>) => V;

  constructor(entity: T, fieldName: keyof T & string, hint: H, fn: (entity: Reacted<T, H>) => V) {
    this.#entity = entity;
    this.#fieldName = fieldName;
    this.#hint = hint;
    this.#fn = fn;
  }

  get get(): V {
    return this.#fn(this.#entity as any);
  }

  get reactiveHint(): H {
    return this.#hint;
  }

  [AsyncPropertyT] = undefined as any as T;
}

/** Type guard utility for determining if an entity field is an AsyncProperty. */
export function isReactiveGetter(maybeReactiveGetter: any): maybeReactiveGetter is ReactiveGetter<any, any> {
  return maybeReactiveGetter instanceof ReactiveGetterImpl;
}
