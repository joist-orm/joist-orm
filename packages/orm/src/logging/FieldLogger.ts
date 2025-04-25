import ansis from "ansis";
import { Entity, isEntity } from "../Entity";
import { getFuzzyCallerName } from "../config";

const { gray, green, yellow, blue, red } = ansis;
export type WriteFn = (line: string) => void;

export type FieldLoggerWatch = {
  /** The entity name, i.e. `Author` */
  entity: string;
  /** The fields, i.e. `["firstName", "lastName"]`. */
  fieldNames?: string[];
  /** Whether to stop a debugger when the field is set. */
  breakpoint?: boolean;
};

/**
 * Logs the setting of fields on entities to a `writeFn`, which defaults to `process.stdout`.
 */
export class FieldLogger {
  readonly #writeFn: WriteFn;
  readonly #watching: FieldLoggerWatch[] = [];

  constructor(
    /** The fields to watch, defaults to all fields. */
    watching: FieldLoggerWatch[],
    /** An optional/semi-internal write function, mostly for testing. */
    writeFn?: WriteFn,
  ) {
    // We default to process.stdout.write to side-step around Jest's console.log instrumentation
    this.#writeFn = writeFn ?? ((line) => process.stdout.write(`${line}\n`));
    this.#watching = watching ?? [];
  }

  logCreate(entity: Entity): void {
    const log = this.shouldLog(entity, "constructor");
    if (!log) return;
    this.log(green.bold(`${entity.toTaggedString()}`) + " " + yellow(`created`), gray(`at ${getFuzzyCallerName()}`));
    if (log === "breakpoint") debugger;
  }

  logSet(entity: Entity, fieldName: string, value: unknown): void {
    const log = this.shouldLog(entity, fieldName);
    if (!log) return;
    const color = this.getColor(value);
    this.log(
      green.bold(`${entity.toTaggedString()}`) + yellow(`.${fieldName}`),
      gray(`=`),
      color(`${value}`),
      // We don't know if we'll be called from getField or M2O.set+getField, i.e. how many stack frames to skip
      // to really get "the caller's location", so use `getFuzzyCallerName` instead of `getCallerName`.
      gray(`at ${getFuzzyCallerName()}`),
    );
    if (log === "breakpoint") debugger;
  }

  private log(...line: string[]): void {
    this.#writeFn(`${line.join(" ")}`);
  }

  private shouldLog(entity: Entity, fieldName: string): boolean | "breakpoint" {
    if (this.#watching.length === 0) return true;
    for (const { entity: entityName, fieldNames, breakpoint } of this.#watching) {
      if (entity.constructor.name === entityName && (fieldNames === undefined || fieldNames.includes(fieldName))) {
        return breakpoint ? "breakpoint" : true;
      }
    }
    return false;
  }

  // Do some `typeof` -> color
  private getColor(value: unknown): typeof red {
    return typeof value === "boolean"
      ? red // boolean => red
      : isEntity(value)
        ? green // entity => green (matches other logging)
        : blue; // otherwise strings/dates/numbers are blue;
  }
}
