import ansis from "ansis";
import { ReactiveField } from "../config";
import { Entity } from "../Entity";
import { EntityManager } from "../EntityManager";
import { Relation } from "../relations";
import { groupBy } from "../utils";

const { gray, green, yellow, white } = ansis;

export let globalLogger: ReactionLogger | undefined = undefined;
type WriteFn = (line: string) => void;

export class ReactionLogger {
  private writeFn: WriteFn;

  // We default to process.stdout.write to side-step around Jest's console.log instrumentation
  constructor(writeFn: WriteFn = process.stdout.write.bind(process.stdout)) {
    this.writeFn = writeFn;
  }

  now(): number {
    return performance.now();
  }

  logQueued(entity: Entity, fieldName: string, rf: ReactiveField): void {
    this.log(
      green.bold(`${entity.toTaggedString()}`) + yellow(`.${fieldName}`),
      gray(`changed, queuing`),
      green.bold(`${entity.toTaggedString()}`) + yellow(maybeDotPath(rf)) + yellow(rf.name),
    );
  }

  logQueuedAll(entity: Entity, reason: string, rf: ReactiveField): void {
    this.log(
      green.bold(`${entity.toTaggedString()}`),
      gray(`${reason}, queuing`),
      green.bold(`${entity.toTaggedString()}`) + green(maybeDotPath(rf)) + yellow(rf.name),
    );
  }

  logStartingRecalc(em: EntityManager, kind: "reactiveFields" | "reactiveQueries"): void {
    this.log(
      white.bold(`Recalculating reactive ${kind === "reactiveQueries" ? "queries" : "fields"} values...`),
      this.entityCount(em),
    );
  }

  logWalked(todo: Entity[], rf: ReactiveField, relations: Relation<any, any>[]): void {
    // Keep for future debugging...
    const from = todo[0].constructor.name;
    this.log(
      " ", // indent
      gray(`Walked`),
      white(`${todo.length}`),
      green.bold(`${from}`) + green(`.${rf.path.join(".")}`),
      gray("paths, found"),
      white(`${relations.length}`),
      green.bold(`${rf.cstr.name}`) + green(".") + yellow(rf.name),
      gray("to recalc"),
    );
    if (relations.length > 0) {
      this.log(
        "   ", // indent
        gray("["),
        todo.map((e) => e.toTaggedString()).join(" "),
        gray("] -> ["),
        [...new Set(relations)].map((r) => r.entity.toTaggedString()).join(" "),
        gray("]"),
      );
    }
  }

  logLoading(em: EntityManager, relations: any[]): void {
    this.log(" ", gray("Loading"), String(relations.length), gray("relations..."), this.entityCount(em));
    // Group by the relation name
    [...groupBy(relations, (r) => `${r.entity.constructor.name}.${r.fieldName}`).entries()].forEach(([, relations]) => {
      const r = relations[0];
      this.log(
        "   ",
        green.bold(r.entity.constructor.name) + green(".") + yellow(r.fieldName),
        gray("-> ["),
        String(relations.map((r: any) => r.entity.toTaggedString()).join(" ")),
        gray("]"),
      );
    });
  }

  logLoadingTime(em: EntityManager, millis: number): void {
    this.log("   ", gray("took"), String(Math.floor(millis)), gray("millis"), this.entityCount(em));
  }

  private entityCount(em: EntityManager): string {
    return gray("(em.entities=") + em.entities.length + gray(")");
  }

  private log(...line: string[]): void {
    this.writeFn(`${line.join(" ")}\n`);
  }
}

export function setReactionLogging(enabled: boolean): void;
export function setReactionLogging(logger: ReactionLogger): void;
export function setReactionLogging(arg: boolean | ReactionLogger): void {
  globalLogger = typeof arg === "boolean" ? (arg ? new ReactionLogger() : undefined) : arg;
}

function maybeDotPath(rf: ReactiveField): string {
  return rf.path.length > 0 ? `.${rf.path.join(".")}.` : ".";
}
