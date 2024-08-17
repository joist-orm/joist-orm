import ansis from "ansis";
import { Entity, isEntity } from "./Entity";
import { getFuzzyCallerName } from "./config";

const { gray, green, yellow, white, blue, red } = ansis;
let globalLogger: FieldLogger | undefined = undefined;
type WriteFn = (line: string) => void;

/**
 * Logs the setting of fields on entities to a `writeFn`, which defaults to `process.stdout`.
 */
export class FieldLogger {
  private writeFn: WriteFn;

  // We default to process.stdout.write to side-step around Jest's console.log instrumentation
  constructor(writeFn: WriteFn = process.stdout.write.bind(process.stdout)) {
    this.writeFn = writeFn;
  }

  logSet(entity: Entity, fieldName: string, value: unknown): void {
    const color = typeof value === "boolean" ? red : isEntity(value) ? green : blue;

    this.log(
      green.bold(`${entity.toTaggedString()}`) + yellow(`.${fieldName}`),
      gray(`=`),
      color(`${value}`),
      // We don't know if we'll be called from getField or M2O.set+getField, i.e. how many stack frames to skip
      // to really get "the caller's location", so use `getFuzzyCallerName` instead of `getCallerName`.
      gray(`at ${getFuzzyCallerName()}`),
    );
  }

  private log(...line: string[]): void {
    this.writeFn(`${line.join(" ")}\n`);
  }
}
