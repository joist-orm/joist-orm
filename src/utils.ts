export function getOrSet<T extends Record<keyof unknown, unknown>>(
  record: T,
  key: keyof T,
  defaultValue: T[keyof T] | (() => T[keyof T]),
): T[keyof T] {
  if (record[key] === undefined) {
    record[key] = defaultValue instanceof Function ? defaultValue() : defaultValue;
  }
  return record[key];
}

export function fail(message?: string): never {
  throw new Error(message || "Failed");
}

export function remove<T>(array: T[], t: T): void {
  const index = array.indexOf(t);
  if (index > -1) {
    array.splice(index, 1);
  }
}

export function zeroTo(n: number): number[] {
  return [...Array(n).keys()];
}
