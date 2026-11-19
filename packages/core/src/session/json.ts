import { isClientId } from "../clientIds.ts";
import { getConstructorFromTaggedId } from "../configure.ts";
import { type Entity, isEntity } from "../Entity.ts";
import type { EntityConstructor, EntityManager } from "../EntityManager.ts";
import { type Field, getMetadata } from "../EntityMetadata.ts";
import { getField } from "../fields.ts";
import type { ValidationErrors } from "../rules.ts";
import { failIfAnyRejected } from "../utils.ts";

/**
 * Converts between Session JSON and entity values. Joist's database serde maps entity values to
 * physical columns; Session relationships use tagged IDs, including client IDs before a row exists.
 */

export type SessionValue = null | boolean | number | string | SessionValue[] | { [key: string]: SessionValue };

export interface SessionEntityData {
  id: string;
  type: string;
  values: Record<string, SessionValue>;
}

export interface SessionError {
  id?: string;
  field?: string;
  code?: string;
  message: string;
}

/** Reads the requested fields from entity metadata and encodes their values as JSON. */
export async function readSessionEntityData(entity: Entity, names: readonly string[]): Promise<SessionEntityData> {
  const meta = getMetadata(entity);
  // Start relation loads together so Joist can batch fields that use the same loader.
  const entries = names.map(async (name) => {
    const field = meta.allFields[name];
    if (!Object.hasOwn(meta.allFields, name) || !field) throw new Error(`Unknown field ${name}`);
    if (field.kind === "primitive" && field.lazy) throw new Error("Session prototype does not support lazy fields");
    if (field.kind === "primitive" || field.kind === "enum" || field.kind === "primaryKey") {
      return [name, encodeValue(getField(entity, name))] as const;
    }
    const relation = (entity as unknown as Record<string, Loadable>)[name];
    return [name, encodeValue(await relation.load())] as const;
  });
  const values = Object.fromEntries(failIfAnyRejected(await Promise.allSettled(entries)));
  return { id: sessionId(entity), type: meta.type, values };
}

export function encodeValidationErrors(error: ValidationErrors): SessionError[] {
  return error.errors.map((entry) => ({
    ...("entity" in entry ? { id: sessionId(entry.entity) } : {}),
    ...(entry.field !== undefined ? { field: entry.field } : {}),
    ...(entry.code !== undefined ? { code: entry.code } : {}),
    message: entry.message,
  }));
}

/** Keeps speculative database IDs out of previews; persisted entities always use their database IDs. */
export function sessionId(entity: Entity): string {
  return entity.isNewEntity ? entity.$clientId! : entity.idTagged;
}

/** Serializes supported domain values without calling entity.toJSON or returning live objects. */
export function encodeValue(value: unknown): SessionValue {
  if (value === undefined || value === null) return null;
  if (isEntity(value)) return sessionId(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(encodeValue);
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encodeValue(entry)]));
  }
  throw new Error("Session prototype cannot serialize this domain value");
}

/** Preserves reference identity even when tracking contains an unloaded foreign-key ID. */
export function encodeField(em: EntityManager, field: Field, value: unknown): SessionValue {
  if ((field.kind === "m2o" || field.kind === "poly") && value !== undefined && value !== null && !isEntity(value)) {
    const loaded = em.getEntity(String(value));
    return loaded ? sessionId(loaded) : String(value);
  }
  return encodeValue(value);
}

/** Resolves an entity by its client ID or database ID. */
export async function resolveSessionId(
  em: EntityManager,
  target: string,
  createdIds?: ReadonlySet<string>,
): Promise<Entity> {
  if (typeof target !== "string" || !target) throw new Error("Expected a session id");
  const type = getConstructorFromTaggedId(target);
  // Hook-created entities can differ between staging and replay, even though the EM gives them client IDs.
  if (createdIds && isClientId(target) && !createdIds.has(target)) {
    throw new Error(
      `Cannot use client ID ${target} in this command. No earlier create command in this Session supplied that ID.`,
    );
  }
  const entity = await em.load(type, target);
  if (createdIds && entity.isNewEntity && !isClientId(target))
    throw new Error("Execution-generated entities are not command targets");
  return entity;
}

// Decode one member for add/remove using the same field metadata as an update.
export async function decodeCollectionMember(
  resolve: ResolveEntityFn,
  entity: Entity,
  name: string,
  input: string,
): Promise<Entity> {
  const field = writableField(entity.constructor as EntityConstructor<Entity>, name);
  const value = await decodeField(resolve, field, input);
  if (field.kind !== "m2m" && field.kind !== "o2m") throw new Error("add/remove requires an entity collection");
  if (!isEntity(value)) throw new Error("add/remove requires one entity reference");
  return value;
}

/** Decodes create/update values before invoking the entity's ordinary mutation behavior. */
export async function decodeValues(
  resolve: ResolveEntityFn,
  type: EntityConstructor<Entity>,
  input: Record<string, SessionValue>,
): Promise<Record<string, unknown>> {
  // Queue reference loads together, but keep the caller's field order for the setters.
  const entries = Object.entries(input).map(async (entry) => {
    const [name, value] = entry;
    return [name, await decodeField(resolve, writableField(type, name), value)] as const;
  });
  return Object.fromEntries(failIfAnyRejected(await Promise.allSettled(entries)));
}

/**
 * Maps JSON references through normal loads and rejects unsupported value codecs explicitly.
 *
 * Null is the command boundary's explicit unset value; omitted fields are never synthesized as edits.
 */
async function decodeField(resolve: ResolveEntityFn, field: Field, value: SessionValue): Promise<unknown> {
  if (value === null) return undefined;
  if (field.kind === "m2o" || field.kind === "poly" || field.kind === "m2m" || field.kind === "o2m") {
    if (Array.isArray(value)) {
      if (field.kind !== "m2m" && field.kind !== "o2m") throw new Error("Expected one entity reference");
      return failIfAnyRejected(await Promise.allSettled(value.map((entry) => decodeField(resolve, field, entry))));
    }
    if (typeof value !== "string") throw new Error("Expected a relationship id");
    const entity = await resolve(value);
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
export function copyJson<T>(value: T): T {
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

type ResolveEntityFn = (id: string) => Promise<Entity>;

interface Loadable {
  load(): Promise<unknown>;
}
