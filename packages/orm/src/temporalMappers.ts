import type { Temporal } from "temporal-polyfill";
import { CustomSerde } from "./serde";
import { maybeRequireTemporal } from "./temporal";
import { fail } from "./utils";

const { Temporal: t } = maybeRequireTemporal() ?? {};
const temporalNotAvailable = {
  fromDb: () => fail("Temporal not available"),
  toDb: () => fail("Temporal not available"),
};

export const plainDateMapper: CustomSerde<Temporal.PlainDate, string> = t
  ? {
      fromDb: t.PlainDate.from,
      toDb: (p) => p.toString(),
    }
  : temporalNotAvailable;

export const plainTimeMapper: CustomSerde<Temporal.PlainTime, string> = t
  ? {
      fromDb: t.PlainTime.from,
      toDb: (pt) => pt.toString(),
    }
  : temporalNotAvailable;

export const plainDateTimeMapper: CustomSerde<Temporal.PlainDateTime, string> = t
  ? {
      // Should look like `2018-01-01 10:00:00`
      fromDb: (s) => t.PlainDateTime.from(s),
      toDb: (p) => p.toString(),
    }
  : temporalNotAvailable;

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
