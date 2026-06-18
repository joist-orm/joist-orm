import { type Intl, type Temporal as TemporalType, type toTemporalInstant } from "temporal-polyfill";
import { fail } from "./utils";

type RequireTemporal = { Temporal: typeof TemporalType; toTemporalInstant: typeof toTemporalInstant; Intl: typeof Intl };
let temporal: RequireTemporal | undefined | false;

/** Lazily exposes Joist's native-first Temporal implementation. */
export const Temporal = new Proxy(
  {},
  {
    get(_target, property, receiver) {
      return Reflect.get(requireTemporal().Temporal, property, receiver);
    },
  },
) as typeof TemporalType;

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
  const native = globalThis as { Temporal?: typeof TemporalType; Intl?: typeof Intl };
  if (isTemporal(native.Temporal) && native.Intl) {
    temporal = {
      Temporal: native.Temporal,
      toTemporalInstant: getNativeToTemporalInstant(native.Temporal),
      Intl: native.Intl,
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

/** Returns true if `temporal` has the constructors Joist uses. */
function isTemporal(temporal: typeof TemporalType | undefined): temporal is typeof TemporalType {
  return (
    !!temporal?.Instant &&
    !!temporal.PlainDate &&
    !!temporal.PlainDateTime &&
    !!temporal.PlainTime &&
    !!temporal.ZonedDateTime
  );
}

/** Returns native `Date#toTemporalInstant`, or a native-Temporal equivalent. */
function getNativeToTemporalInstant(nativeTemporal: typeof TemporalType): typeof toTemporalInstant {
  return (
    (Date.prototype as Date & { toTemporalInstant?: typeof toTemporalInstant }).toTemporalInstant ??
    function toTemporalInstantFromDate(this: Date) {
      return nativeTemporal.Instant.fromEpochMilliseconds(this.getTime());
    }
  );
}
