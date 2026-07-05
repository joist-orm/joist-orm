import "vitest";

// `joist-test-utils` augments Jest's/Bun's matcher interfaces, but not Vitest's, so wire
// `toMatchEntity` onto Vitest's `Assertion` here. `expected` stays `any` since the strongly
// typed `MatchedEntity<T>` helper isn't part of the package's public API.
declare module "vitest" {
  interface Assertion<T = any> {
    toMatchEntity(expected: any): void;
  }
  interface AsymmetricMatchersContaining {
    toMatchEntity(expected: any): void;
  }
}
