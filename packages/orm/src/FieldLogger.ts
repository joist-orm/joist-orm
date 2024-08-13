import ansis from "ansis";
import { Entity } from "./Entity";

const { gray, green, yellow, white } = ansis;
let globalLogger: FieldLogger | undefined = undefined;
type WriteFn = (line: string) => void;

export class FieldLogger {
  private writeFn: WriteFn;

  // We default to process.stdout.write to side-step around Jest's console.log instrumentation
  constructor(writeFn: WriteFn = process.stdout.write.bind(process.stdout)) {
    this.writeFn = writeFn;
  }

  logSet(entity: Entity, fieldName: string, value: unknown): void {
    this.log(green.bold(`${entity.toTaggedString()}`) + yellow(`.${fieldName}`), gray(`=`), green.bold(`${value}`));
  }

  private log(...line: string[]): void {
    this.writeFn(`${line.join(" ")}\n`);
  }
}
