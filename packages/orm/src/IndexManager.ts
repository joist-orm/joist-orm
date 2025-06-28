import { Entity, isEntity } from "./Entity";
import { EntityMetadata, getMetadata } from "./EntityMetadata";
import { ManyToOneReference, PolymorphicReference, isLoadedReference } from "./relations";
import { groupBy } from "./utils";

type FieldValue = any;
type FieldName = string;
type EntityTag = string;

/**
 * IndexManager provides field-based indexing for entity queries to avoid O(n) linear scans of `em.entities`.
 *
 * Key features:
 * - Only indexes entity types with >1000 entities to avoid overhead for small datasets
 * - Supports dual indexing for m2o/poly fields (by ID for saved, by instance for unsaved)
 * - Automatically maintains indexes when fields are updated via setField()
 */
export class IndexManager {
  readonly #indexes: Map<EntityTag, Map<FieldName, FieldIndex>> = new Map();
  readonly #indexedTags: Set<EntityTag> = new Set();
  readonly #indexThreshold = 1_000;

  /** @return if we should index entities of this type/count. */
  shouldIndexType(entityCount: number): boolean {
    return entityCount >= this.#indexThreshold;
  }

  /** Visible for testing. */
  isIndexed(tagName: string): boolean {
    return this.#indexedTags.has(tagName);
  }

  /** Enables indexing for an entity type and builds initial indexes. */
  enableIndexingForType<T extends Entity>(meta: EntityMetadata<T>, entities: T[]): void {
    const { tagName } = meta;
    if (this.#indexedTags.has(tagName)) return; // Already indexed
    this.#indexedTags.add(tagName);
    this.#indexes.set(tagName, new Map());

    // If subtypes are involved, group by each subtype
    if (meta.baseType || meta.subTypes.length > 0) {
      [...groupBy(entities, (e) => getMetadata(e)).entries()].forEach(([meta, entities]) => {
        this.addEntitiesToIndex(meta, entities);
      });
    } else {
      this.addEntitiesToIndex(meta, entities);
    }
  }

  /** Adds an entity to all relevant indexes. */
  maybeIndexEntity(entity: Entity): void {
    const meta = getMetadata(entity);
    if (this.#indexedTags.has(meta.tagName)) {
      this.addEntitiesToIndex(meta, [entity]);
    }
  }

  /** Updates indexes when a field value changes. */
  updateFieldIndex(entity: Entity, fieldName: string, oldValue: any, newValue: any): void {
    const meta = getMetadata(entity);
    if (!this.#indexedTags.has(meta.tagName)) return; // Type not indexed
    const field = meta.allFields[fieldName] ?? fail(`Invalid field ${fieldName}`);
    let fieldIndex = this.#indexes.get(meta.tagName)!.get(field.fieldName);
    if (!fieldIndex) {
      fieldIndex = new FieldIndex();
      this.#indexes.get(meta.tagName)!.set(field.fieldName, fieldIndex);
    }
    fieldIndex.remove(oldValue, entity);
    fieldIndex.add(newValue, entity);
  }

  /**
   * Finds entities matching the given where clause using indexes.
   * Returns null if the type is not indexed (fallback to linear search).
   */
  findMatching<T extends Entity>(meta: EntityMetadata<T>, where: any): T[] {
    const { tagName } = meta;
    if (!this.#indexedTags.has(tagName)) {
      throw new Error(`${meta.type} is not indexed`);
    }
    const fieldIndexes = this.#indexes.get(tagName)!;
    // Start with all entities of the 1st condition, then intersect (AND) each subsequent field in `where`
    let candidates: Set<Entity> | undefined;
    for (const [fieldName, value] of Object.entries(where)) {
      const fieldIndex = fieldIndexes.get(fieldName) ?? new FieldIndex();
      const fieldCandidates = fieldIndex.get(value) ?? new Set();
      if (!candidates) {
        candidates = fieldCandidates; // This is the 1st clause
      } else {
        candidates = intersectSets(candidates, fieldCandidates);
      }
      // Early exit if no candidates remain
      if (candidates.size === 0) break;
    }
    return candidates ? ([...candidates] as T[]) : [];
  }

  // `entities` should all be of the exact same subtype
  private addEntitiesToIndex(meta: EntityMetadata, entities: Entity[]): void {
    const { tagName } = meta;
    const indexes = this.#indexes.get(tagName)!;
    // Iterate over each field so we can do a shared fieldIndex lookup
    for (const [fieldName, field] of Object.entries(meta.allFields)) {
      let fieldIndex = indexes.get(fieldName);
      if (!fieldIndex) {
        fieldIndex = new FieldIndex();
        indexes.set(fieldName, fieldIndex);
      }
      for (const entity of entities) {
        const value = getFieldValue(entity, fieldName);
        fieldIndex.add(value, entity);
      }
    }
  }
}

// Use the same field access pattern as entityMatches
function getFieldValue(entity: Entity, fieldName: string): any {
  const meta = getMetadata(entity);
  const field = meta.allFields[fieldName] ?? fail();

  const fn = fieldName as keyof Entity;
  switch (field.kind) {
    case "primaryKey":
      return entity.idTaggedMaybe;
    case "enum":
    case "primitive":
      return (entity as any)[fn];
    case "m2o":
    case "poly":
      const relation = (entity as any)[fn] as
        | ManyToOneReference<Entity, any, any>
        | PolymorphicReference<Entity, any, any>;
      if (isLoadedReference(relation)) {
        return relation.get;
      } else if (relation.isSet) {
        return relation.id;
      } else {
        return undefined;
      }
    default:
      return undefined;
  }
}

/**
 * For a given field, like `firstName`, holds the reverse index of value `bob` -> entities `[a1, a2]`.
 *
 * This also handles indexes `Entity` values as both instances & IDs, to handle both:
 * - new/unpersisted entities not yet having IDs, and
 * - relations not having loaded their instances yet
 */
class FieldIndex {
  readonly #valueToEntities = new Map<FieldValue, Set<Entity>>();

  /** @return entities that have `value` as their current value for this field. */
  get(value: any): Set<Entity> | undefined {
    if (isEntity(value) && value.idTaggedMaybe) {
      // If `value` is a persisted entity like `a:1`, and entities could have indexed their `author_id=a:1` field
      // values as the unloaded "just an a:1 string id" value, before `a:1` was loaded into memory.
      const matchId = this.#valueToEntities.get(value.idTaggedMaybe);
      // But other entities could also have indexes `a:1` as an instance, so go ahead and check both
      const matchInstance = this.#valueToEntities.get(value);
      if (matchId && matchInstance) {
        return new Set([...matchId, ...matchInstance]);
      }
      return matchId ?? matchInstance;
    }
    return this.#valueToEntities.get(value);
  }

  add(value: any, entity: Entity): void {
    // If this is an entity, store both the entity itself & its ID
    if (isEntity(value) && value.idTaggedMaybe) {
      this.doAdd(value.idTaggedMaybe, entity);
    }
    this.doAdd(value, entity);
  }

  remove(value: any, entity: Entity): void {
    if (isEntity(value) && value.idTaggedMaybe) {
      this.doRemove(value.idTaggedMaybe, entity);
    }
    this.doRemove(value, entity);
  }

  private doAdd(value: any, entity: Entity): void {
    const set = this.#valueToEntities.get(value) ?? new Set();
    if (set.size === 0) this.#valueToEntities.set(value, set);
    set.add(entity);
  }

  private doRemove(value: any, entity: Entity): void {
    const set = this.#valueToEntities.get(value);
    if (set) {
      set.delete(entity);
      if (set.size === 0) {
        this.#valueToEntities.delete(value);
      }
    }
  }
}

function intersectSets<T>(set1: Set<T>, set2: Set<T>): Set<T> {
  const result = new Set<T>();
  for (const e of set1) {
    if (set2.has(e)) result.add(e);
  }
  return result;
}
