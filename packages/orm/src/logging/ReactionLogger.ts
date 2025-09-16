import ansis from "ansis";
import { ReactiveActor } from "../config";
import { Entity } from "../Entity";
import { EntityManager } from "../EntityManager";
import { ReactiveAction } from "../ReactionsManager";
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

  logQueued(entity: Entity, fieldName: string, ra: ReactiveActor): void {
    this.log(
      green.bold(`${entity.toTaggedString()}`) + yellow(`.${fieldName}`),
      gray(`changed, queuing`),
      green.bold(`${entity.toTaggedString()}`) + yellow(maybeDotPath(ra)) + yellow(ra.name),
    );
  }

  logQueuedAll(entity: Entity, reason: string, ra: ReactiveActor): void {
    this.log(
      green.bold(`${entity.toTaggedString()}`),
      gray(`${reason}, queuing`),
      green.bold(`${entity.toTaggedString()}`) + green(maybeDotPath(ra)) + yellow(ra.name),
    );
  }

  logStartingRecalc(em: EntityManager, kind: "reactiveActors" | "reactiveQueries"): void {
    this.log(
      white.bold(`Recalculating reactive ${kind === "reactiveQueries" ? "queries" : "fields"} values...`),
      this.entityCount(em),
    );
  }

  logWalked(todo: Entity[], ra: ReactiveActor, entities: Entity[]): void {
    // Keep for future debugging...
    const from = todo[0].constructor.name;
    this.log(
      " ", // indent
      gray(`Walked`),
      white(`${todo.length}`),
      green.bold(`${from}`) + green(`.${ra.path.join(".")}`),
      gray("paths, found"),
      white(`${entities.length}`),
      green.bold(`${ra.cstr.name}`) + green(".") + yellow(ra.name),
      gray("to recalc"),
    );
    if (entities.length > 0) {
      this.log(
        "   ", // indent
        gray("["),
        todo.map((e) => e.toTaggedString()).join(" "),
        gray("] -> ["),
        [...new Set(entities)].map((e) => e.toTaggedString()).join(" "),
        gray("]"),
      );
    }
  }

  logLoading(em: EntityManager, actions: ReactiveAction[]): void {
    this.log(" ", gray("Loading"), String(actions.length), gray("actions..."), this.entityCount(em));
    // Group by the action name
    [...groupBy(actions, (a) => `${a.entity.constructor.name},${a.ra.name}`).values()].forEach((actions) => {
      const { ra, entity } = actions[0];
      this.log(
        "   ",
        green.bold(entity.constructor.name) + green(".") + yellow(ra.name),
        gray("-> ["),
        String(actions.map((a) => a.entity.toTaggedString()).join(" ")),
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

function maybeDotPath(ra: ReactiveActor): string {
  return ra.path.length > 0 ? `.${ra.path.join(".")}.` : ".";
}
