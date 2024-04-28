import { Temporal } from "temporal-polyfill";

export const jan1 = Temporal.PlainDate.from("2018-01-01");
export const jan2 = Temporal.PlainDate.from("2018-01-02");
export const jan3 = Temporal.PlainDate.from("2018-01-03");
export const jan1DateTime = jan1.toZonedDateTime("UTC");
export const jan2DateTime = jan2.toZonedDateTime("UTC");
export const jan3DateTime = jan3.toZonedDateTime("UTC");

export function fail(message?: string): never {
  throw new Error(message || "Failed");
}

export type FixedSizeArray<L extends number, T> = L extends 0 ? never[] : { length: L } & Array<T>;

export function zeroTo<L extends number, R>(n: L, fn: (i: number) => R): FixedSizeArray<L, R>;
export function zeroTo<L extends number>(n: L): FixedSizeArray<L, number>;
export function zeroTo<L extends number, R>(
  n: L,
  fn?: (i: number) => R,
): FixedSizeArray<L, R> | FixedSizeArray<L, number> {
  const array = [...Array(n).keys()] as FixedSizeArray<L, number>;
  return fn ? (array.map((i) => fn(i)) as FixedSizeArray<L, R>) : array;
}
