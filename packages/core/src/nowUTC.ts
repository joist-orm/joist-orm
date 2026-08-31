import { type Temporal, requireTemporal } from "./temporal.ts";

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

  const zonedDateTime = requireTemporal().toTemporalInstant.call(now).toZonedDateTimeISO("UTC");
  if (type === "plainDate") return zonedDateTime.toPlainDate();
  if (type === "plainDateTime") return zonedDateTime.toPlainDateTime();
  return zonedDateTime;
}
