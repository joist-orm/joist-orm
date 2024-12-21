export { ConnectionConfig, newPgConnectionConfig } from "./connection";
export { Deferred } from "./Deferred";
export { isPlainObject } from "./is-plain-object";

export function fail(message?: string): never {
  throw new Error(message || "Failed");
}

export function groupBy<T, Y = T>(
  list: readonly T[],
  fn: (x: T) => string,
  valueFn?: (x: T) => Y,
): Record<string, Y[]> {
  const result: Record<string, Y[]> = {};
  list.forEach((o) => {
    const group = fn(o);
    if (result[group] === undefined) {
      result[group] = [];
    }
    result[group].push(valueFn === undefined ? (o as any as Y) : valueFn(o));
  });
  return result;
}

export function keyBy<T, K extends PropertyKey, Y = T>(
  list: readonly T[],
  fnOrKey: CallbackFn<T, K> | keyof T[][number],
  valueFn?: CallbackFn<T, Y>,
) {
  const result = {} as Record<K, Y>;
  const fn = typeof fnOrKey === "function" ? fnOrKey : (x: T) => x[fnOrKey] as K;
  list.forEach((e, i, a) => {
    const group = fn(e, i, a);
    if (result[group] !== undefined) {
      throw new Error(`${String(group)} already had a value assigned`);
    }
    result[group] = valueFn ? valueFn(e, i, a) : (e as any as Y);
  });
  return result;
}

export type CallbackFn<T, R = any> = (element: T, index: number, array: readonly T[]) => R;
