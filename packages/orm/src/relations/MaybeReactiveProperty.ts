import { ReactiveHint } from "../reactiveHints";

/**
 * Allows properties to be expanded/converted into reactive hints.
 *
 * I.e. a `hasManyThrough(a => a.books.reviews)` is not a core m2o/o2m/m2m relation, but
 * since it's composed of them, we can expand it into a reactive hint.
 *
 * Sometimes this might depend on the hint, i.e. not every `hasManyThrough`'s lens will
 * necessarily go through a convertable-to-reactive path, so the `toExpandedReactiveHint`
 * method is allowed to return `undefined`.
 */
export interface MaybeReactiveProperty {
  get toExpandedReactiveHint(): ReactiveHint<any> | undefined;
}

export function isMaybeReactiveProperty(x: any): x is MaybeReactiveProperty {
  return x && "toExpandedReactiveHint" in x;
}
