import { assertClientId } from "../clientIds.ts";
import { getMetadataForType } from "../configure.ts";
import type { Entity } from "../Entity.ts";
import { type EntityConstructor, type EntityManager, getEmInternalApi } from "../EntityManager.ts";
import { getMetadata } from "../EntityMetadata.ts";
import { ValidationErrors } from "../rules.ts";
import { runInUntrustedContext } from "../trusted.ts";
import { type SessionChange, captureSessionChanges } from "./changes.ts";
import {
  type SessionEntityData,
  type SessionError,
  type SessionValue,
  copyJson,
  decodeCollectionMember,
  decodeValues,
  encodeValidationErrors,
  readSessionEntityData,
  resolveSessionId,
  sessionId,
} from "./json.ts";

export interface SessionOptions<EM extends EntityManager> {
  /** Lazily supplies a fresh, empty writable application EM with its context and plugins for each execution. */
  createEm: () => EM | Promise<EM>;
}

export type SessionCommand =
  | { op: "create"; type: string; $clientId: string; values: Record<string, SessionValue> }
  | { op: "update"; entity: string; values: Record<string, SessionValue> }
  | { op: "add" | "remove"; entity: string; field: string; value: string }
  | { op: "delete"; entity: string };

export type SessionValidation =
  | { status: "valid"; scope: "pre-write" | "full"; changes: SessionChange[] }
  | { status: "invalid"; errors: SessionError[] };

export type SessionReview =
  | { status: "valid"; revision: number; changes: SessionChange[] }
  | { status: "invalid"; errors: SessionError[] };

/**
 * Collects entity changes for validation, review, and commit.
 *
 * Preview and commit replay commands on fresh EntityManagers.
 */
export class Session<EM extends EntityManager = EntityManager> {
  readonly #options: SessionOptions<EM>;
  #staging: EM | undefined;
  readonly #createdIds = new Set<string>(); // Client IDs from accepted create commands.
  readonly #executions = new WeakSet<EntityManager>();
  readonly #log: SessionCommand[] = [];
  #revision = 0; // Counts successful commands so a preview identifies which edits it includes.
  #state: "open" | "tainted" | "committed" = "open";
  #busy = false;

  constructor(options: SessionOptions<EM>) {
    this.#options = options;
  }

  /** Applies and records one JSON command. */
  async apply(command: SessionCommand): Promise<{ id: string }> {
    return this.#withStaging((staging) => this.#apply(staging, command));
  }

  /** Applies commands sequentially, retaining successful commands and stopping at the first failure. */
  async applyBatch(commands: readonly SessionCommand[]): Promise<{ id: string }[]> {
    return this.#withStaging(async (staging) => {
      const results: { id: string }[] = [];
      for (const command of commands) results.push(await this.#apply(staging, command));
      return results;
    });
  }

  /** Reads selected metadata fields, never arbitrary methods or a live entity instance. */
  async read(input: { entity: string; fields: readonly string[] }): Promise<SessionEntityData> {
    return this.#withStaging(async (staging) => {
      const entity = await resolveSessionId(staging, input.entity);
      return readSessionEntityData(entity, input.fields);
    });
  }

  /**
   * Runs an application-owned query against the current staging EM without recording a command.
   *
   * The callback shares the operation lock and normal application permissions; it is not a privileged
   * ORM context. Data that is returned to clients/external callers should be serialized instead of
   * returning direct entity references, which clients could then mutate & side-step the Session's command log.
   */
  async query<T>(callback: (em: EM) => T | Promise<T>): Promise<T> {
    return this.#withStaging(async (em) => callback(em));
  }

  /** Runs recoverable pre-SQL validation; query-derived and database checks are deferred to preview. */
  async validateChanges(): Promise<SessionValidation> {
    return this.#withStaging(async (staging) => {
      try {
        return await dryRun(staging, "validate");
      } finally {
        // A callback may have changed entities before throwing. Keep only the accepted commands.
        if (getEmInternalApi(staging).hasFailedFlush) this.#staging = undefined;
      }
    });
  }

  /** Previews the current commands on a disposable EM without saving changes. */
  async previewChanges(): Promise<SessionReview> {
    return this.#exclusive(async () => {
      const result = await dryRun(await this.#replay());
      if (result.status === "invalid") return result;
      return { status: "valid", revision: this.#revision, changes: result.changes };
    });
  }

  /** Replays the current commands and saves changes with an ordinary flush. */
  async commitChanges(): Promise<{ ids: Record<string, string> }> {
    return this.#exclusive(async () => {
      const em = await this.#replay();
      try {
        await em.flush();
      } catch (error) {
        // An after-commit failure or a lost COMMIT response must never enable a duplicate commit attempt.
        this.#state = "tainted";
        throw error;
      }
      this.#state = "committed";
      const ids: Record<string, string> = {};
      for (const entity of em.entities) {
        const clientId = entity.$clientId;
        if (clientId && this.#createdIds.has(clientId) && !entity.isDeletedEntity && entity.idTaggedMaybe !== undefined)
          ids[clientId] = entity.idTagged;
      }
      return { ids };
    });
  }

  /** Rebuilds the editing EM without flushing so the caller can correct the input before callbacks run. */
  async #withStaging<T>(fn: (em: EM) => Promise<T>): Promise<T> {
    return this.#exclusive(async () => {
      this.#staging ??= await this.#replay();
      return fn(this.#staging);
    });
  }

  /** Prevents concurrent operations from sharing an EntityManager. */
  async #exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#state !== "open") throw new Error(`Session is ${this.#state}`);
    if (this.#busy) throw new Error("Session operation already in progress");
    this.#busy = true;
    try {
      return await fn();
    } finally {
      this.#busy = false;
    }
  }

  /** Uses the caller's factory for every role so context and enforcing plugins are never cloned away. */
  async #newEm(): Promise<EM> {
    const em = await this.#options.createEm();
    if (this.#executions.has(em)) throw new Error("Session factory must return a fresh EntityManager");
    if (em.txn || em.entities.length || em.mode !== "writes")
      throw new Error("Session requires a fresh writable EntityManager");
    this.#executions.add(em);
    return em;
  }

  /** Fresh replay is authoritative; speculative staging flush boundaries are deliberately not logged. */
  async #replay(): Promise<EM> {
    const em = await this.#newEm();
    for (const command of this.#log) await this.#executeCommand(em, copyJson(command));
    return em;
  }

  /** Executes and records a command identically for single-command and batch operations. */
  async #apply(em: EM, command: SessionCommand): Promise<{ id: string }> {
    const copy = copyJson(command);
    if (copy.op === "create" && this.#createdIds.has(copy.$clientId))
      throw new Error(`Client id ${copy.$clientId} is already registered`);
    const entity = await this.#executeCommand(em, copy, this.#createdIds);
    const id = sessionId(entity);
    this.#log.push(copy);
    if (copy.op === "create") this.#createdIds.add(copy.$clientId);
    this.#revision++;
    return { id };
  }

  /**
   * Resolves IDs, decodes values, and applies one command.
   *
   * A setter can throw after changing earlier fields. Only successful commands are recorded for replay.
   */
  async #executeCommand(em: EM, command: SessionCommand, createdIds?: ReadonlySet<string>): Promise<Entity> {
    function resolve(id: string): Promise<Entity> {
      return resolveSessionId(em, id, createdIds);
    }

    // Create a new entity with the caller's client ID.
    if (command.op === "create") {
      const type = getMetadataForType(command.type).cstr as EntityConstructor<Entity>;
      assertClientId(getMetadata(type), command.$clientId);
      if (em.getEntity(command.$clientId)) throw new Error(`Client id ${command.$clientId} is already registered`);
      const values = await decodeValues(resolve, type, command.values);
      return em.create(type, { ...values, $clientId: command.$clientId } as never);
    }

    // Resolve the entity used by the remaining commands.
    const entity = await resolve(command.entity);
    if (entity.isDeletedEntity) throw new Error("Cannot mutate a deleted session entity");

    // Delete the entity.
    if (command.op === "delete") {
      em.delete(entity);
      return entity;
    }

    // Update the requested fields.
    if (command.op === "update") {
      const values = await decodeValues(resolve, entity.constructor as EntityConstructor<Entity>, command.values);
      entity.set(values);
      return entity;
    }

    // Resolve the collection and its member for add/remove.
    if (command.op !== "add" && command.op !== "remove") throw new Error("Unknown session command");
    const value = await decodeCollectionMember(resolve, entity, command.field, command.value);
    const relation = (entity as unknown as Record<string, MutableCollection>)[command.field];

    // Add the member to the collection.
    if (command.op === "add") {
      relation.add(value);
      return entity;
    }

    // Remove the member from the collection.
    relation.remove(value);
    return entity;
  }
}

interface MutableCollection {
  add(value: unknown): void;
  remove(value: unknown): void;
}

/**
 * Captures pre-write or rollback-only changes and returns structured validation errors.
 *
 * Serialization runs outside trusted ORM access so preview output cannot inherit internal permissions.
 */
async function dryRun(em: EntityManager, mode: true | "validate" = true): Promise<SessionValidation> {
  try {
    await em.flush({ dryRun: mode });
    const changes = runInUntrustedContext(() => captureSessionChanges(em));
    return { status: "valid", scope: mode === "validate" ? "pre-write" : "full", changes };
  } catch (error) {
    if (!(error instanceof ValidationErrors)) throw error;
    return { status: "invalid", errors: encodeValidationErrors(error) };
  }
}
