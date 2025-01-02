import type { Temporal } from "temporal-polyfill";
import { CustomSerde } from "./serde";
import { maybeRequireTemporal } from "./temporal";
import { fail } from "./utils";

const { Temporal: t } = maybeRequireTemporal() ?? {};
const temporalNotAvailable = {
  fromDb: () => fail("Temporal not available"),
  toDb: () => fail("Temporal not available"),
};

/** Converts Postgres `DATE` to/from Temporal.PlainDate. */
export const plainDateMapper: CustomSerde<Temporal.PlainDate, string> = t
  ? {
      fromDb: t.PlainDate.from,
      toDb: (p) => p.toString(),
    }
  : temporalNotAvailable;

/** Converts Postgres `TIME` to/from Temporal.PlainTime. */
export const plainTimeMapper: CustomSerde<Temporal.PlainTime, string> = t
  ? {
      fromDb: t.PlainTime.from,
      toDb: (pt) => pt.toString(),
    }
  : temporalNotAvailable;

/** Converts Postgres `TIMESTAMP` / `TIMESTAMP WITHOUT TIME ZONE` to/from Temporal.PlainDateTime. */
export const plainDateTimeMapper: CustomSerde<Temporal.PlainDateTime, string> = t
  ? {
      // Should look like `2018-01-01 10:00:00`
      fromDb: (s) => t.PlainDateTime.from(s),
      toDb: (p) => p.toString(),
    }
  : temporalNotAvailable;

/**
 * Converts Postgres `TIMESTAMPTZ`, `TIMESTAMPTZ WITH TIME ZONE` to/from Temporal.PlainDateTime.
 *
 * Specifically Postgres uses ISO 8601, which Temporal does as well, except that:
 *
 * - PG uses a space instead of `T` between the date/time, and
 * - Temporal needs `[UTC]`appended, b/c even with the numeric offset, it wants to know which specific zone.
 */
export const zonedDateTimeMapper: CustomSerde<Temporal.ZonedDateTime, string> = t
  ? {
      // Should we use the application's time zone here? Afaiu we're using an explicit
      // offset anyway, so I believe the time zone is effectively irrelevant, albeit maybe
      // it would be used for DST/etc nuances when doing date calculations.
      fromDb: (s) => t.ZonedDateTime.from(s.replace(" ", "T") + "[UTC]"),
      // Match the pg `TIMESTAMPTZ` format, i.e. "2021-01-01 12:00:00-05:00"
      toDb: (zdt) => `${zdt.toPlainDate().toString()} ${zdt.toPlainTime().toString()}${zdt.offset}`,
    }
  : temporalNotAvailable;
