import { fail } from "./utils";

// temporal-polyfill 1.0+ is ESM-only (its package.json `exports` expose only an `import`
// condition), so we force ESM type resolution via `resolution-mode: "import"`; a normal import
// would resolve in this CommonJS module's `require` mode and fail to find the type declarations.
type TemporalModule = typeof import("temporal-polyfill", { with: { "resolution-mode": "import" } });

type RequireTemporal = {
  Temporal: TemporalModule["Temporal"];
  toTemporalInstant: TemporalModule["toTemporalInstant"];
  // temporal-polyfill 1.0 exposes `Intl` only as a type namespace, not a value export, and
  // nothing reads this field, so we type it as the host `Intl` that the global branch assigns.
  Intl: typeof globalThis.Intl;
};
let temporal: RequireTemporal | undefined | false;

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
) as TemporalModule["Temporal"];

/**
 * A type-only `Temporal` namespace that merges with the `const Temporal` above.
 *
 * The `const` is only a value, so using `Temporal.PlainDate` / `Temporal.ZonedDateTime` as a
 * type needs a namespace to resolve against. Node 26 has that as a global, but older Node
 * versions don't, so we add it here by pointing the names at `temporal-polyfill`'s types.
 */
export declare namespace Temporal {
  export type Instant = InstanceType<TemporalModule["Temporal"]["Instant"]>;
  export type ZonedDateTime = InstanceType<TemporalModule["Temporal"]["ZonedDateTime"]>;
  export type PlainDate = InstanceType<TemporalModule["Temporal"]["PlainDate"]>;
  export type PlainTime = InstanceType<TemporalModule["Temporal"]["PlainTime"]>;
  export type PlainDateTime = InstanceType<TemporalModule["Temporal"]["PlainDateTime"]>;
  export type PlainYearMonth = InstanceType<TemporalModule["Temporal"]["PlainYearMonth"]>;
  export type PlainMonthDay = InstanceType<TemporalModule["Temporal"]["PlainMonthDay"]>;
  export type Duration = InstanceType<TemporalModule["Temporal"]["Duration"]>;
}

/**
 * Conditionally/dynamically requires `temporal-polyfill`.
 *
 * We want to avoid directly importing/requiring `temporal-polyfill` because
 * it will introduce the dependency to all users of Joist.
 */
export function maybeRequireTemporal(): RequireTemporal | undefined {
  // if we've already failed to find a temporal implementation before, early exit
  if (temporal === false) return undefined;
  // if we already required temporal, just return that
  if (temporal) return temporal;
  // use built in temporal if present
  if ("Temporal" in global && "Intl" in global) {
    temporal = {
      Temporal: global.Temporal as typeof Temporal,
      toTemporalInstant: (Date.prototype as any).toTemporalInstant,
      Intl: global.Intl as typeof Intl,
    };
    return temporal;
  }
  // preferentially try to use temporal-polyfill
  try {
    temporal = require("temporal-polyfill");
    return temporal as RequireTemporal;
  } catch (e) {}
  // last resort, try to use @js-temporal/polyfill
  try {
    temporal = require("@js-temporal/polyfill");
    return temporal as RequireTemporal;
  } catch (e) {}
  // don't try to load temporal again
  temporal = false;
  return undefined;
}

export function requireTemporal(): RequireTemporal {
  return maybeRequireTemporal() ?? fail("Unable to find a Temporal implementation");
}
