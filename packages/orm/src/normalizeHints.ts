import { Entity } from "./Entity";
import { LoadHint } from "./loadHints";
import { ReactiveHint } from "./reactiveHints";

/** Normalizes a `key | key[] | { key: nested }` hint into `{ key: nested }`. */
export type NormalizeHint<T extends Entity, H> = H extends string
  ? Record<DropSuffix<H>, {}>
  : H extends ReadonlyArray<any>
  ? Record<DropSuffix<H[number]>, {}>
  : { [K in keyof H as DropSuffix<K>]: H[K] };

/** The separator between field names and the modified; we allow `_` for keys in hashes. */
export type SuffixSeperator = ":" | "_";

export type DropSuffix<K> = K extends `${infer key}${SuffixSeperator}ro` ? key : K;

export const suffixRe = /[:|_]ro$/;

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

/** Normalizes a `key | key[] | { key: nested }` hint into `{ key: nested }`. */
export function deepNormalizeHint<T extends Entity>(hint: LoadHint<T> | ReactiveHint<T>): object {
  if (typeof hint === "string") {
    return { [hint]: {} };
  } else if (Array.isArray(hint)) {
    return Object.fromEntries(hint.map((field) => [field, {}]));
  } else {
    return Object.fromEntries(Object.entries(hint).map(([key, value]) => [key, deepNormalizeHint(value)]));
  }
}
