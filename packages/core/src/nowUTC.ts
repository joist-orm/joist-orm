import { type Temporal, requireTemporal } from "src/serde/temporal.ts";

/** Returns the current UTC value in the requested Date or Temporal shape. */
export function nowUTC(): Date;
export function nowUTC(type: "plainDate"): Temporal.PlainDate;
export function nowUTC(type: "plainDateTime"): Temporal.PlainDateTime;
export function nowUTC(type: "zonedDateTime"): Temporal.ZonedDateTime;
export function nowUTC(
  type?: "plainDate" | "plainDateTime" | "zonedDateTime",
): Date | Temporal.PlainDate | Temporal.PlainDateTime | Temporal.ZonedDateTime {
  const now = new Date();
  if (type === undefined) return now;

  // Date's native conversion can return another realm's Temporal objects in a VM such as Jest.
  const zonedDateTime = requireTemporal()
    .Temporal.Instant.fromEpochMilliseconds(now.getTime())
    .toZonedDateTimeISO("UTC");
  if (type === "plainDate") return zonedDateTime.toPlainDate();
  if (type === "plainDateTime") return zonedDateTime.toPlainDateTime();
  return zonedDateTime;
}
