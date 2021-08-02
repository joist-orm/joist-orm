import "@jest/types";
export { newPgConnectionConfig } from "./connection";

export function fail(message?: string): never {
  throw new Error(message || "Failed");
}

export function groupBy<T, Y = T>(list: T[], fn: (x: T) => string, valueFn?: (x: T) => Y): Record<string, Y[]> {
  const result: Record<string, Y[]> = {};
  list.forEach((o) => {
    const group = fn(o);
    if (result[group] === undefined) {
      result[group] = [];
    }
    result[group].push(valueFn === undefined ? ((o as any) as Y) : valueFn(o));
  });
  return result;
}
