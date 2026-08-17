import { type CustomSerde } from "./serde.ts";
import { type Temporal, maybeRequireTemporal } from "./temporal.ts";
import { fail } from "./utils.ts";

const { Temporal: t } = maybeRequireTemporal() ?? {};
const temporalNotAvailable = {
  fromDb: () => fail("Temporal not available"),
  toDb: () => fail("Temporal not available"),
};

/**
 * Converts Postgres `DATE` to/from Temporal.PlainDate.
 *
 * `fromDb` accepts either pg's text form (classic/knex text queries, json_agg preloads) or an
 * already-constructed `PlainDate` (lazy binary queries decode wire bytes -> Temporal directly).
 */
export const plainDateMapper: CustomSerde<Temporal.PlainDate, string> = t
  ? {
      fromDb: (value: string | Temporal.PlainDate) => (value instanceof t.PlainDate ? value : t.PlainDate.from(value)),
      toDb: (p) => p.toString(),
    }
  : temporalNotAvailable;

/** Converts Postgres `TIME` to/from Temporal.PlainTime; `fromDb` also passes binary-decoded instances through. */
export const plainTimeMapper: CustomSerde<Temporal.PlainTime, string> = t
  ? {
      fromDb: (value: string | Temporal.PlainTime) => (value instanceof t.PlainTime ? value : t.PlainTime.from(value)),
      toDb: (pt) => pt.toString(),
    }
  : temporalNotAvailable;

/**
 * Converts Postgres `TIMESTAMP` / `TIMESTAMP WITHOUT TIME ZONE` to/from Temporal.PlainDateTime;
 * `fromDb` also passes binary-decoded instances through.
 */
export const plainDateTimeMapper: CustomSerde<Temporal.PlainDateTime, string> = t
  ? {
      // Text values look like `2018-01-01 10:00:00`
      fromDb: (value: string | Temporal.PlainDateTime) =>
        value instanceof t.PlainDateTime ? value : t.PlainDateTime.from(value),
      toDb: (p) => p.toString(),
    }
  : temporalNotAvailable;

/**
 * Converts Postgres `TIMESTAMPTZ`, `TIMESTAMPTZ WITH TIME ZONE` to/from Temporal.ZonedDateTime.
 *
 * Specifically, Postgres uses ISO 8601, which Temporal supports as well, except that PG ouputs a space instead of `T`
 * between the date/time for output.
 *
 * Additionally, `Temporal.ZonedDateTime.from` expects a time zone literal name to be supplied as part of the string,
 * but this is not stored by postgres.
 *
 * As such, we parse the offset and append it to string passed to `from` as the time zone.  This means that if we did a
 * round trip of generating a db value then parsing it, then it may not strictly equal the original zdt.
 *
 * Finally, PG stores dates as UTC and converts them to its local time zone for output, so we could get any offset
 * theoretically.  If, somehow, we don't get an offset, then we assume UTC.
 */
export const zonedDateTimeMapper: CustomSerde<Temporal.ZonedDateTime, string> = t
  ? {
      // Produce a ZDT from a PG output like "2021-01-01 12:00:00-05:00"; binary-decoded
      // instances (lazy queries construct ZonedDateTimes directly) pass through
      fromDb: (value: string | Temporal.ZonedDateTime) => {
        if (typeof value !== "string") return value;
        const [offset] = value.match(/([+-]\d{2}(?::?\d{2})?)$/) ?? [];
        return t.ZonedDateTime.from(`${value}[${!offset || /^\+00(:?00)?$/.test(offset) ? "UTC" : offset}]`);
      },
      // Match a PG `TIMESTAMPTZ` input format, i.e. "2021-01-01T12:00:00-05:00"
      toDb: (zdt) => zdt.toString({ timeZoneName: "never" }),
    }
  : temporalNotAvailable;
