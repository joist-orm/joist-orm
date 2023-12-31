export { ConnectionConfig, newPgConnectionConfig } from "./connection";
export { isPlainObject } from "./is-plain-object";
export { setupLatestPgTypes } from "./setupLatestPgTypes";

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
