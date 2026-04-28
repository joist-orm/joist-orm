import { Entity, isEntity } from "./Entity";
import { EntityManager, MaybeAbstractEntityConstructor, TooManyError } from "./EntityManager";
import { EntityMetadata, Field, getBaseMeta, getMetadata } from "./EntityMetadata";
import { setField } from "./fields";

/** Clears the soft-delete marker so a matched entity is updated instead of recreated. */
export function resurrectIfSoftDeleted(entity: Entity): void {
  const deletedAt = getBaseMeta(getMetadata(entity)).timestampFields?.deletedAt;
  if (deletedAt && (entity as any).isSoftDeletedEntity) {
    setField(entity, deletedAt, undefined);
  }
}

/**
 * Finds an existing entity when the input fully covers one configured `uniqueBy` candidate.
 * I.e. with `uniqueBy = [["email"], ["author", "title"]]`, `{ email }` or `{ authorId, title }` can lookup an existing row.
 */
export async function findExistingIfUniqueBy<T extends Entity>(
  em: EntityManager<any, any, any>,
  constructor: MaybeAbstractEntityConstructor<T>,
  input: object,
): Promise<T | undefined> {
  const meta = getMetadata(constructor);
  const candidates = getUniqueByCandidates(meta, input);
  for (const where of candidates) {
    const inMemory = em.filterEntities(constructor as any, where as any) as T[];
    if (inMemory.length > 1) {
      throw new TooManyError(`Found more than one existing ${meta.type} with ${whereAsString(where)}`);
    } else if (inMemory.length === 1) {
      return inMemory[0];
    }

    // I.e. `{ publisher: newPublisherEntity }` cannot already exist in the database, so skip the `em.find`.
    const hasNewEntityParam = Object.values(where).some((value) => isEntity(value) && value.isNewEntity);
    if (hasNewEntityParam) continue;

    const entities = (await (em as any).find(constructor, where, { softDeletes: "include" })).filter(
      (entity: Entity) => !entity.isDeletedEntity,
    ) as T[];
    if (entities.length > 1) {
      throw new TooManyError(`Found more than one existing ${meta.type} with ${whereAsString(where)}`);
    } else if (entities.length === 1) {
      return entities[0];
    }
  }
  return undefined;
}

/** Builds pushdown-safe where clauses from configured identity fields. */
function getUniqueByCandidates(meta: EntityMetadata, input: object): object[] {
  return (meta.uniqueBy ?? getBaseMeta(meta).uniqueBy ?? []).flatMap((fields) => {
    const where: Record<string, unknown> = {};
    for (const fieldName of fields) {
      const field = meta.allFields[fieldName];
      if (!field || !isQueryableIdentityField(field)) return [];
      const value = getIdentityValue(field, input);
      if (value === undefined || value === null) return [];
      where[field.fieldName] = value;
    }
    return [where];
  });
}

/** Returns the identity value from the input. */
function getIdentityValue(field: Field, input: object): unknown {
  if (Object.hasOwn(input, field.fieldName)) {
    return normalizeIdentityValue((input as Record<string, unknown>)[field.fieldName]);
  }
  if (field.fieldIdName && Object.hasOwn(input, field.fieldIdName)) {
    return normalizeIdentityValue((input as Record<string, unknown>)[field.fieldIdName]);
  }
  return undefined;
}

/** Returns raw ids from relation inputs, i.e. `{ publisher: { id: "p:1" } }` becomes `{ publisher: "p:1" }`. */
function normalizeIdentityValue(value: unknown): unknown {
  if (!isEntity(value) && value && typeof value === "object" && Object.hasOwn(value, "id")) {
    return (value as { id?: unknown }).id;
  }
  return value;
}

/** Returns true if Joist can push this identity field into a flat find clause. */
function isQueryableIdentityField(field: Field): boolean {
  return field.kind === "primitive" || field.kind === "enum" || field.kind === "m2o" || field.kind === "poly";
}

function whereAsString(where: object): string {
  return Object.entries(where)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}
