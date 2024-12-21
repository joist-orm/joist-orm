import type { Intl, Temporal, toTemporalInstant } from "temporal-polyfill";
import { fail } from "./utils";

type RequireTemporal = { Temporal: typeof Temporal; toTemporalInstant: typeof toTemporalInstant; Intl: typeof Intl };
let temporal: RequireTemporal | undefined | false;

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
