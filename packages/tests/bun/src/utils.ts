export function fail(message?: string): never {
  throw new Error(message || "Failed");
}

export function zeroTo(n: number): number[] {
  return [...Array(n).keys()];
}
