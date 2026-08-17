/// <reference types="temporal-spec/global" preserve="true" />

import { createRequire } from "node:module";

const runtimeRequire = createRequire(import.meta.url);

// Native Temporal and both supported polyfills expose this shape; use the shared spec types instead of duplicating it.
type TemporalModule = typeof import("temporal-spec");
let temporal: TemporalModule | undefined | false;

/**
 * Lazily exposes Joist's native-first / polyfill-fallback Temporal detection.
 *
 * This is useful while the joist-orm repo itself has both pre-Node 26, and post-Node 26
 * test coverage, b/c our CI test suite needs the same a) codegen output and b) test suites
 * to "just work" with either Node 24/25 or Node 26, which means they can't have an explicit
 * import to either `temporal-polyfill` or the `Temporal` global.
 *
 * This is exactly what Joist's internal temporal resolution was already working around, so
 * this just exposes an `import { Temporal } from joist-orm` that lets the codegen & tests
 * reuse the same abstraction.
 */
export const Temporal = new Proxy(
  {},
  {
    get(_target, property, receiver) {
      return Reflect.get(requireTemporal().Temporal, property, receiver);
    },
  },
) as typeof globalThis.Temporal;

/**
 * A type-only `Temporal` namespace that merges with the `const Temporal` above.
 *
 * The `const` is only a value, so using `Temporal.PlainDate` / `Temporal.ZonedDateTime` as a
 * type needs a namespace to resolve against. Node 26 has that as a global, but older Node
 * versions don't, so `temporal-spec/global` supplies the same global namespace as a fallback.
 */
export declare namespace Temporal {
  export type Instant = globalThis.Temporal.Instant;
  export type ZonedDateTime = globalThis.Temporal.ZonedDateTime;
  export type PlainDate = globalThis.Temporal.PlainDate;
  export type PlainTime = globalThis.Temporal.PlainTime;
  export type PlainDateTime = globalThis.Temporal.PlainDateTime;
  export type PlainYearMonth = globalThis.Temporal.PlainYearMonth;
  export type PlainMonthDay = globalThis.Temporal.PlainMonthDay;
  export type Duration = globalThis.Temporal.Duration;
}

/**
 * Conditionally/dynamically requires `temporal-polyfill`.
 *
 * We want to avoid directly importing/requiring `temporal-polyfill` because
 * it will introduce the dependency to all users of Joist.
 */
export function maybeRequireTemporal(): TemporalModule | undefined {
  // if we've already failed to find a temporal implementation before, early exit
  if (temporal === false) return undefined;
  // if we already required temporal, just return that
  if (temporal) return temporal;
  // use built in temporal if present
  if ("Temporal" in global && "Intl" in global) {
    temporal = {
      Temporal: global.Temporal as typeof globalThis.Temporal,
      toTemporalInstant: Date.prototype.toTemporalInstant,
      Intl: global.Intl,
    };
    return temporal;
  }
  // preferentially try to use temporal-polyfill
  try {
    temporal = runtimeRequire("temporal-polyfill");
    return temporal as TemporalModule;
  } catch (e) {}
  // last resort, try to use @js-temporal/polyfill
  try {
    temporal = runtimeRequire("@js-temporal/polyfill");
    return temporal as TemporalModule;
  } catch (e) {}
  // don't try to load temporal again
  temporal = false;
  return undefined;
}

export function requireTemporal(): TemporalModule {
  const temporal = maybeRequireTemporal();
  if (!temporal) throw new Error("Unable to find a Temporal implementation");
  return temporal;
}
