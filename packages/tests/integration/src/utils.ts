export function fail(message?: string): never {
  throw new Error(message || "Failed");
}

export type FixedSizeArray<L extends number, T> = L extends 0 ? never[] : { length: L } & Array<T>;

/** Returns 0 inclusive to n exclusive. */
export function zeroTo<L extends number, R>(n: L, fn: (i: number) => R): FixedSizeArray<L, R>;
export function zeroTo<L extends number>(n: L): FixedSizeArray<L, number>;
export function zeroTo<L extends number, R>(
  n: L,
  fn?: (i: number) => R,
): FixedSizeArray<L, R> | FixedSizeArray<L, number> {
  const array = [...Array(n).keys()] as FixedSizeArray<L, number>;
  return fn ? (array.map((i) => fn(i)) as FixedSizeArray<L, R>) : array;
}

/** Returns a range of `[1..n]`, i.e. inclusive of 1 and `n`. */
export function oneTo<L extends number, R>(n: L, fn: (i: number) => R): FixedSizeArray<L, R>;
export function oneTo<L extends number>(n: L): FixedSizeArray<L, number>;
export function oneTo<L extends number, R>(n: L, fn?: (i: number) => R) {
  const array = [...Array(n).keys()].map((i) => i + 1) as FixedSizeArray<L, number>;
  return fn ? (array.map((i) => fn(i)) as FixedSizeArray<L, R>) : array;
}

export function twoOf<T>(fn: (i: number) => T) {
  return zeroTo(2, (i) => fn(i));
}

export function threeOf<T>(fn: (i: number) => T) {
  return zeroTo(3, (i) => fn(i));
}

export function fourOf<T>(fn: (i: number) => T) {
  return zeroTo(4, (i) => fn(i));
}
