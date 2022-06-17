import { Entity } from "./Entity";
import { LoadHint } from "./loadHints";
import { ReactiveHint } from "./reactiveHints";

/** Normalizes a `key | key[] | { key: nested }` hint into `{ key: nested }`. */
export type NormalizeHint<T extends Entity, H> = H extends keyof T
  ? Record<H, {}>
  : H extends ReadonlyArray<keyof T>
  ? Record<H[number], {}>
  : H;

/** Normalizes a `key | key[] | { key: nested }` hint into `{ key: nested }`. */
export function normalizeHint<T extends Entity>(hint: LoadHint<T> | ReactiveHint<T>): object {
  if (typeof hint === "string") {
    return { [hint]: {} };
  } else if (Array.isArray(hint)) {
    return Object.fromEntries(hint.map((field) => [field, {}]));
  } else {
    return hint;
  }
}
