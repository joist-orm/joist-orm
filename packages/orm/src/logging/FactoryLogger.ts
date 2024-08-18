import ansis from "ansis";
import { getCallerName } from "../config";
import { Entity } from "../Entity";
import { EntityMetadata } from "../EntityMetadata";
import { UseMapSource } from "../newTestInstance";

let writer: WriteFn | undefined = undefined;
export type WriteFn = (line: string) => void;

const { gray, green, yellow } = ansis;

export class FactoryLogger {
  private level = 0;
  private writeFn: WriteFn;
  private skipNextLogCreating = false;

  // We default to process.stdout.write to side-step around Jest's console.log instrumentation
  // adding "...at..." stack traces to our output.
  constructor() {
    this.writeFn = writer ?? process.stdout.write.bind(process.stdout);
  }

  logCreating(cstr: any): void {
    // This was already logged by the parent `field = creating new`
    if (this.skipNextLogCreating) {
      this.skipNextLogCreating = false;
    } else {
      this.write("Creating", green.bold(`new ${cstr.name}`), gray(`at ${getCallerName(2)}`));
    }
  }

  logAddToUseMap(e: Entity, source: UseMapSource): void {
    if (source === "sameBranch" || source === "diffBranch") {
      this.write(`${gray(`created`)} ${e.toString()} ${gray("added to scope")}`);
    } else {
      this.write(`${gray(`...adding`)} ${e.toString()} ${gray("opt to scope")}`);
    }
  }

  logCreated(e: Entity): void {
    // This matches the `logAddToUseMap` but for entities not going into scope
    this.write(`${gray(`created`)} ${e.toString()}`);
  }

  logFoundExisting(e: Entity): void {
    // Make this yellow because it reverses the "new Entity" we thought we were going to do
    this.write(`${yellow(`using existing`)} ${e.toString()}`);
  }

  logFoundOpt(fieldName: string, e: Entity): void {
    this.write(`${gray(`${fieldName} =`)} ${e.toString()} ${gray("from opt")}`);
  }

  logNotFoundAndCreating(fieldName: string, meta: EntityMetadata): void {
    this.write(`${gray(`${fieldName} =`)} creating ${green.bold(`new ${meta.type}`)}`);
    this.skipNextLogCreating = true;
  }

  logFoundInUseMap(fieldName: string, e: Entity): void {
    this.write(`${gray(`${fieldName} =`)} ${e.toString()} ${gray("from scope")}`);
  }

  logFoundSingleEntity(fieldName: string, e: Entity): void {
    this.write(`${gray(`${fieldName} =`)} ${e.toString()} ${gray("from em")}`);
  }

  indent() {
    this.level++;
  }

  dedent() {
    this.level--;
  }

  private write(...line: string[]): void {
    this.writeFn(this.prefix() + line.join(" ") + "\n");
  }

  private prefix() {
    return "  ".repeat(this.level);
  }
}

// Allow our test suite observe the logger behavior
export function setFactoryWriter(write: WriteFn | undefined): void {
  writer = write;
}
