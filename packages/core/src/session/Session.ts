import { randomUUID } from "node:crypto";

import { type Entity, isEntity } from "../Entity.ts";
import type { EntityConstructor, EntityManager } from "../EntityManager.ts";
import { type Field, getMetadata } from "../EntityMetadata.ts";
import { getField } from "../fields.ts";
import { ValidationErrors } from "../rules.ts";
import { runInUntrustedContext } from "../trusted.ts";
import { captureSessionChanges, encodeSessionValue, sessionRef } from "./changes.ts";
import type {
  SessionCommand,
  SessionExecution,
  SessionOptions,
  SessionRef,
  SessionReview,
  SessionSnapshot,
  SessionValidation,
  SessionValue,
} from "./types.ts";

/**
 * Experimental JSON workspace: caller commands are the log, while ordinary entities remain private.
 *
 * Staging is warm and advisory. Review and commit replay accepted commands on fresh application EMs.
 */
export class Session<EM extends EntityManager = EntityManager> {
  readonly #options: SessionOptions<EM>;
  readonly #types = new Map<string, EntityConstructor<Entity>>();
  #staging: SessionExecution | undefined;
  readonly #executions = new WeakSet<EntityManager>();
  readonly #log: SessionCommand[] = [];
  #revision = 0;
  #state: "open" | "tainted" | "committed" | "disposed" = "open";
  #busy = false;
  #review: { token: string; revision: number } | undefined;

  constructor(options: SessionOptions<EM>) {
    this.#options = options;
    for (const type of options.types) this.#types.set(getMetadata(type).type, type);
  }

  /** Applies and records one JSON command; unexpected partial mutation failures taint the workspace. */
  async apply(command: SessionCommand): Promise<SessionRef> {
    return this.#exclusive((staging) => this.#apply(staging, command));
  }

  /** Applies commands sequentially, retaining successful commands and stopping at the first failure. */
  async applyBatch(commands: readonly SessionCommand[]): Promise<SessionRef[]> {
    return this.#exclusive(async (staging) => {
      const refs: SessionRef[] = [];
      for (const command of commands) refs.push(await this.#apply(staging, command));
      return refs;
    });
  }

  /** Reads selected metadata fields, never arbitrary methods or a live entity instance. */
  async read(input: { target: SessionRef; fields: readonly string[] }): Promise<SessionSnapshot> {
    return this.#exclusive(async (staging) => {
      const entity = await this.#resolve(staging, input.target);
      return readSnapshot(staging, entity, input.fields);
    });
  }

  /** Finds persisted rows using allowlisted equality filters; subsequent writes log resolved references. */
  async find(input: {
    type: string;
    where: Record<string, SessionValue>;
    fields: readonly string[];
  }): Promise<SessionSnapshot[]> {
    return this.#exclusive(async (staging) => {
      const type = this.#types.get(input.type);
      if (!type) throw new Error(`Unknown session type ${input.type}`);
      const where: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(copyJson(input.where))) {
        const field = getMetadata(type).allFields[name];
        if (!Object.hasOwn(getMetadata(type).allFields, name) || !field?.serde)
          throw new Error(`Unsupported filter field ${name}`);
        where[name] = value === null ? null : await this.#decode(staging, field, value);
      }
      const entities = await staging.em.find(type, where as never);
      return Promise.all(entities.map((entity) => readSnapshot(staging, entity, input.fields)));
    });
  }

  /** Runs recoverable pre-SQL validation; query-derived and database checks are deferred to preview. */
  async validateChanges(): Promise<SessionValidation> {
    return this.#exclusive(async (staging) => {
      try {
        return await dryRun(staging, "validate");
      } catch (error) {
        this.#state = "tainted";
        throw error;
      }
    });
  }

  /** Replays intent once on a disposable EM and binds a review to the current revision. */
  async previewChanges(): Promise<SessionReview> {
    return this.#exclusive(async () => {
      this.#review = undefined;
      const execution = await this.#replay();
      const result = await dryRun(execution);
      if (result.status === "invalid") return result;
      const token = randomUUID();
      this.#review = { token, revision: this.#revision };
      return { status: "valid", reviewToken: token, revision: this.#revision, changes: result.changes };
    });
  }

  /**
   * Replays the reviewed command revision and performs an ordinary flush.
   *
   * Preview is advisory: this does not compare the final writes with previewed values.
   */
  async commitChanges(input: { reviewToken: string }): Promise<{ ids: Record<string, string> }> {
    return this.#exclusive(async () => {
      const review = this.#review;
      if (!review || review.token !== input.reviewToken || review.revision !== this.#revision)
        throw new Error("Invalid or stale review token");
      // Consume before attempting SQL: failed commits need a new review rather than ambiguous retries.
      this.#review = undefined;
      const execution = await this.#replay();
      try {
        await execution.em.flush();
      } catch (error) {
        // An after-commit failure or a lost COMMIT response must never enable a duplicate commit attempt.
        this.#state = "tainted";
        throw error;
      }
      this.#state = "committed";
      const ids: Record<string, string> = {};
      for (const [key, entity] of execution.entities) {
        if (!entity.isDeletedEntity && entity.idTaggedMaybe !== undefined) ids[key] = entity.idTagged;
      }
      return { ids };
    });
  }

  /** Makes abandoned staging and review state inaccessible; no transaction is held between calls. */
  dispose(): void {
    if (this.#busy) throw new Error("Session operation already in progress");
    this.#state = "disposed";
    this.#review = undefined;
    this.#log.length = 0;
    this.#staging?.entities.clear();
    this.#staging?.refs.clear();
    this.#staging = undefined;
  }

  /** Serializes operations so a command cannot race a review's revision check. */
  async #exclusive<T>(fn: (staging: SessionExecution) => Promise<T>): Promise<T> {
    if (this.#state !== "open") throw new Error(`Session is ${this.#state}`);
    if (this.#busy) throw new Error("Session operation already in progress");
    this.#busy = true;
    try {
      // Await inside the operation so factory rejection is observed and leaves initialization retryable.
      this.#staging ??= await this.#newExecution();
      return await fn(this.#staging);
    } finally {
      this.#busy = false;
    }
  }

  /** Uses the caller's factory for every role so context and enforcing plugins are never cloned away. */
  async #newExecution(): Promise<SessionExecution> {
    const em = await this.#options.createEm();
    if (this.#executions.has(em)) throw new Error("Session factory must return a fresh EntityManager");
    if (em.txn || em.entities.length || em.mode !== "writes")
      throw new Error("Session requires a fresh writable EntityManager");
    this.#executions.add(em);
    return { em, entities: new Map(), refs: new Map() };
  }

  /** Fresh replay is authoritative; speculative staging flush boundaries are deliberately not logged. */
  async #replay(): Promise<SessionExecution> {
    const execution = await this.#newExecution();
    for (const command of this.#log) (await this.#prepareCommand(execution, copyJson(command)))();
    return execution;
  }

  /** Executes and records a command identically for single-command and batch operations. */
  async #apply(staging: SessionExecution, command: SessionCommand): Promise<SessionRef> {
    const copy = copyJson(command);
    // Decode and resolve before mutation so malformed commands do not taint an otherwise usable workspace.
    const apply = await this.#prepareCommand(staging, copy);
    try {
      const entity = apply();
      this.#log.push(copy);
      this.#revision++;
      this.#review = undefined;
      return { ref: sessionRef(staging, entity) };
    } catch (error) {
      this.#state = "tainted";
      throw error;
    }
  }

  /** Resolves only explicit creation keys or durable IDs from the allowlisted entity families. */
  async #resolve(execution: SessionExecution, target: SessionRef): Promise<Entity> {
    if (!target || typeof target.ref !== "string") throw new Error("Expected a session reference");
    const known = execution.entities.get(target.ref);
    if (known) return known;
    const tag = target.ref.split(":")[0];
    const type = [...this.#types.values()].find((candidate) => getMetadata(candidate).tagName === tag);
    if (!type || !target.ref.includes(":")) throw new Error(`Unknown session reference ${target.ref}`);
    const entity = await execution.em.load(type, target.ref);
    if (entity.isNewEntity) throw new Error("Execution-generated entities are not command targets");
    return entity;
  }

  /**
   * Prepares a narrow public-ORM mutation after all asynchronous decoding has succeeded.
   *
   * Returning an operation separates input errors from errors that may have partially mutated staging.
   */
  async #prepareCommand(execution: SessionExecution, command: SessionCommand): Promise<() => Entity> {
    if (command.op === "create") {
      const type = this.#types.get(command.type);
      if (!type) throw new Error(`Unknown session type ${command.type}`);
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(command.key) || execution.entities.has(command.key))
        throw new Error("Invalid or duplicate creation key");
      const values = await this.#decodeValues(execution, type, command.values);
      return () => {
        const entity = execution.em.create(type, values as never);
        execution.entities.set(command.key, entity);
        execution.refs.set(entity, command.key);
        return entity;
      };
    }

    const entity = await this.#resolve(execution, command.target);
    if (entity.isDeletedEntity) throw new Error("Cannot mutate a deleted session entity");
    if (command.op === "delete")
      return () => {
        execution.em.delete(entity);
        return entity;
      };
    if (command.op === "touch")
      return () => {
        execution.em.touch(entity);
        return entity;
      };
    if (command.op === "set") {
      const values = await this.#decodeValues(
        execution,
        entity.constructor as EntityConstructor<Entity>,
        command.values,
      );
      return () => {
        entity.set(values);
        return entity;
      };
    }
    const field = writableField(entity.constructor as EntityConstructor<Entity>, command.field);
    const value = await this.#decode(execution, field, command.value as unknown as SessionValue);
    if (field.kind !== "m2m" && field.kind !== "o2m") throw new Error("add/remove requires an entity collection");
    if (!isEntity(value)) throw new Error("add/remove requires one entity reference");
    const relation = (entity as unknown as Record<string, MutableCollection>)[command.field];
    return () => {
      if (command.op === "add") relation.add(value);
      else if (command.op === "remove") relation.remove(value);
      else throw new Error("Unknown session command");
      return entity;
    };
  }

  /** Decodes create/set values before invoking the entity's ordinary mutation behavior. */
  async #decodeValues(
    execution: SessionExecution,
    type: EntityConstructor<Entity>,
    input: Record<string, SessionValue>,
  ): Promise<Record<string, unknown>> {
    const values: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(input)) {
      values[name] = await this.#decode(execution, writableField(type, name), value);
    }
    return values;
  }

  /**
   * Maps JSON references through normal loads and rejects unsupported value codecs explicitly.
   *
   * Null is the command boundary's explicit unset value; omitted fields are never synthesized as edits.
   */
  async #decode(execution: SessionExecution, field: Field, value: SessionValue): Promise<unknown> {
    if (value === null) return undefined;
    if (field.kind === "m2o" || field.kind === "poly" || field.kind === "m2m" || field.kind === "o2m") {
      if (Array.isArray(value)) {
        if (field.kind !== "m2m" && field.kind !== "o2m") throw new Error("Expected one entity reference");
        return Promise.all(value.map((entry) => this.#decode(execution, field, entry)));
      }
      if (typeof value !== "object" || !("ref" in value) || typeof value.ref !== "string")
        throw new Error("Expected a session reference");
      const entity = await this.#resolve(execution, { ref: value.ref });
      if (field.kind !== "poly" && !(entity instanceof field.otherMetadata().cstr))
        throw new Error("Reference has the wrong entity type");
      return entity;
    }
    if (field.kind === "primitive" || field.kind === "enum") {
      if (field.serde.columns[0].isArray) {
        if (!Array.isArray(value)) throw new Error("Expected an array");
        return value.map((entry) => decodeScalar(field, entry));
      }
      return decodeScalar(field, value);
    }
    return value;
  }
}

interface Loadable {
  load(): Promise<unknown>;
}
interface MutableCollection {
  add(value: unknown): void;
  remove(value: unknown): void;
}

/** Parses supported JSON scalar encodings without translating application validation rules. */
function decodeScalar(field: Extract<Field, { kind: "primitive" | "enum" }>, value: SessionValue): unknown {
  if (field.kind === "enum") {
    if (!Object.values(field.enumType).includes(value)) throw new Error("Invalid enum code");
    return value;
  }
  if (field.type === "Date" || field.type === Date) {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
      throw new Error("Expected an ISO date string");
    return new Date(value);
  }
  if (
    typeof field.type === "string" &&
    ["string", "number", "boolean"].includes(field.type) &&
    typeof value !== field.type
  ) {
    throw new Error(`Expected ${field.type}`);
  }
  if (typeof field.type === "function") throw new Error("Session prototype does not support this field codec");
  return value;
}

/** Loads only selected public fields and encodes their values through the JSON boundary. */
async function readSnapshot(
  execution: SessionExecution,
  entity: Entity,
  names: readonly string[],
): Promise<SessionSnapshot> {
  const meta = getMetadata(entity);
  const values: Record<string, SessionValue> = {};
  for (const name of names) {
    const field = meta.allFields[name];
    if (!Object.hasOwn(meta.allFields, name) || !field) throw new Error(`Unknown field ${name}`);
    if (field.kind === "primitive" && field.lazy) throw new Error("Session prototype does not support lazy fields");
    if (field.kind === "primitive" || field.kind === "enum" || field.kind === "primaryKey") {
      values[name] = encodeSessionValue(execution, getField(entity, name));
    } else {
      const relation = (entity as unknown as Record<string, Loadable>)[name];
      values[name] = encodeSessionValue(execution, await relation.load());
    }
  }
  return { ref: sessionRef(execution, entity), type: meta.type, values };
}

/**
 * Captures pre-write or rollback-only changes and returns structured validation errors.
 *
 * Serialization runs outside trusted ORM access so preview output cannot inherit internal permissions.
 */
async function dryRun(execution: SessionExecution, mode: true | "validate" = true): Promise<SessionValidation> {
  try {
    await execution.em.flush({ dryRun: mode });
    const changes = runInUntrustedContext(() => captureSessionChanges(execution));
    return { status: "valid", scope: mode === "validate" ? "pre-write" : "full", changes };
  } catch (error) {
    if (!(error instanceof ValidationErrors)) throw error;
    return {
      status: "invalid",
      errors: error.errors.map((entry) => ({
        ...("entity" in entry ? { ref: sessionRef(execution, entry.entity) } : {}),
        ...(entry.field !== undefined ? { field: entry.field } : {}),
        ...(entry.code !== undefined ? { code: entry.code } : {}),
        message: entry.message,
      })),
    };
  }
}

/** Limits commands to actual mutable metadata fields instead of arbitrary entity properties or methods. */
function writableField(type: EntityConstructor<Entity>, name: string): Field {
  const meta = getMetadata(type);
  const field = meta.allFields[name];
  if (!Object.hasOwn(meta.allFields, name) || !field) throw new Error(`Unknown field ${name}`);
  if (field.kind === "primaryKey" || ("derived" in field && field.derived) || ("protected" in field && field.protected))
    throw new Error(`Field ${name} is not writable`);
  if (
    field.kind === "o2o" ||
    field.kind === "lo2m" ||
    field.kind === "m2mEnum" ||
    (field.kind === "primitive" && field.lazy)
  )
    throw new Error(`Session prototype does not support ${field.kind} field ${name}`);
  return field;
}

/** Validates the JSON boundary before cloning; never silently strips undefined, functions, or non-finite values. */
function copyJson<T>(value: T): T {
  checkJson(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Rejects non-JSON values even when called directly instead of through an MCP JSON parser. */
function checkJson(value: unknown): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return;
  if (Array.isArray(value)) {
    value.forEach((entry) => checkJson(entry));
    return;
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    Object.values(value).forEach((entry) => checkJson(entry));
    return;
  }
  throw new Error("Session commands must contain only JSON values");
}
