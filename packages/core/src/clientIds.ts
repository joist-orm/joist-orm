import type { Entity } from "src/Entity.ts";
import { type EntityManager, NotFoundError, type TaggedId } from "src/EntityManager.ts";
import type { EntityMetadata, Field } from "src/EntityMetadata.ts";

type ClientRelationField = Extract<Field, { kind: "m2o" | "o2o" | "o2m" | "m2m" | "poly" }>;

/** The separator used by EM-local client IDs. */
export const clientIdTag = "#";

/** Recognizes client IDs by the reserved hash character. */
export function isClientId(value: unknown): value is TaggedId {
  return typeof value === "string" && value.includes(clientIdTag);
}

/** Validates caller-supplied client IDs once, before registration. */
export function assertClientId(
  meta: Pick<EntityMetadata, "tagName" | "type">,
  value: unknown,
): asserts value is TaggedId {
  if (!isClientId(value)) {
    throw new Error(`Invalid client id ${String(value)}; expected ${meta.tagName}${clientIdTag}...`);
  }
  if (!value.startsWith(`${meta.tagName}${clientIdTag}`)) {
    throw new Error(`Invalid client id ${value}; expected tag ${meta.tagName} for ${meta.type}`);
  }
}

/** Resolves client references before ordinary relationship setters; leaves other values unchanged. */
export function maybeResolveClientReference(owner: Entity, field: Field, value: unknown): unknown {
  if (field.kind === "o2m" || field.kind === "m2m") {
    return Array.isArray(value) ? value.map((v) => (isClientId(v) ? resolveClientId(owner.em, field, v) : v)) : value;
  }
  if ((field.kind === "m2o" || field.kind === "o2o" || field.kind === "poly") && isClientId(value)) {
    return resolveClientId(owner.em, field, value);
  }
  return value;
}

/**
 * Looks up a client ID and checks the relationship's target type.
 *
 * Callers must check `isClientId(value)` first; `value` must not be a database ID.
 * Resolution is synchronous and only uses entities already registered in this EM.
 * An unknown client ID throws; this never falls back to `em.load` or queries the database.
 *
 * getEntity(id) checks visibility, but the relationship must also check its expected type.
 */
export function resolveClientId(em: EntityManager, field: ClientRelationField, value: TaggedId): Entity {
  const target = em.getEntity(value);
  if (!target) throw new NotFoundError(`${value} was not found`);

  // Registration already checked the ID; relationships only need to check the resolved entity's type.
  if (field.kind === "poly") {
    if (!field.components.some((c) => target instanceof c.otherMetadata().cstr)) {
      throw new Error(`Client id ${value} cannot be set as ${field.fieldName}`);
    }
  } else {
    const type = field.otherMetadata().cstr;
    if (!(target instanceof type)) {
      throw new Error(`${value} is ${target.constructor.name} but should be ${type.name}`);
    }
  }
  return target;
}
