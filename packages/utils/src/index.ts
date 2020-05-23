export * from "./connection";

export function fail(message?: string): never {
  throw new Error(message || "Failed");
}
