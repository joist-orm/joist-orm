import { Entity } from "./Entity";
import { LoadHint } from "./loadHints";
import { ReactiveHint } from "./reactiveHints";

/** Normalizes a `key | key[] | { key: nested }` hint into `{ key: nested }`. */
export type NormalizeHint<H> = H extends string
  ? Record<DropSuffix<H>, {}>
  : H extends ReadonlyArray<any>
    ? Record<DropSuffix<H[number]>, {}>
    : { [K in keyof H as DropSuffix<K>]: H[K] };

/** The separator between field names and the modified; we allow `_` for keys in hashes. */
export type SuffixSeperator = ":" | "_";

export type DropSuffix<K> = K extends `${infer key}${SuffixSeperator}ro` ? key : K;

export const suffixRe = /[:|_]ro$/;

const normalizedStringHints = new Map<string, object>();
const normalizedArrayHints = new WeakMap<readonly string[], object>();
const hintKeys = new WeakMap<object, string>();

/** Normalizes a `key | key[] | { key: nested }` hint into `{ key: nested }`. */
export function normalizeHint<T extends Entity>(hint: LoadHint<T> | ReactiveHint<T>): object {
  if (typeof hint === "string") {
    return getOrSetStringHint(hint);
  } else if (Array.isArray(hint)) {
    return getOrSetArrayHint(hint as readonly string[]);
  } else {
    return hint;
  }
}

/**
 * Returns a JSON key for batching by hint, cached to avoid repeated `JSON.stringify(hint)` calls.
 *
 * Benchmark TLDR, 5m repeated calls: strings are unchanged, array hints were ~8x faster,
 * nested object hints were ~26-38x faster.
 */
export function hintKey<T extends Entity>(hint: LoadHint<T> | ReactiveHint<T> | undefined): string {
  if (hint === undefined) return "";
  if (typeof hint === "string") return hint;

  let key = hintKeys.get(hint);
  if (key === undefined) {
    key = JSON.stringify(hint);
    hintKeys.set(hint, key);
  }
  return key;
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

function getOrSetStringHint(hint: string): object {
  let normalized = normalizedStringHints.get(hint);
  if (normalized === undefined) {
    normalized = { [hint]: {} };
    normalizedStringHints.set(hint, normalized);
  }
  return normalized;
}

function getOrSetArrayHint(hint: readonly string[]): object {
  let normalized = normalizedArrayHints.get(hint);
  if (normalized === undefined) {
    normalized = Object.fromEntries(hint.map((field) => [field, {}]));
    normalizedArrayHints.set(hint, normalized);
  }
  return normalized;
}
