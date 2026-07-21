import { Entity, isEntity } from "./Entity";
import { EntityMetadata, type Field, getMetadata } from "./EntityMetadata";
import { ManyToOneReference, PolymorphicReference, isLoadedReference } from "./relations";
import { groupBy } from "./utils";

type FieldValue = any;
type FieldName = string;
type EntityTag = string;
type FieldIndexEntry = {
  field: Field;
  index: FieldIndex;
  /** Tracks how far into the EM's list-per-tag array this field index has been lazily populated. */
  indexedCount: number;
};
const emptySet = new Set<Entity>();

// The test reproducing a n^2 with n=500 went from 100ms to 50ms if indexed
export const indexThreshold = 500;

/**
 * IndexManager provides field-based indexing for entity queries to avoid O(n) linear scans of `em.entities`.
 *
 * Key features:
 * - Only indexes entity types with >1000 entities to avoid overhead for small datasets
 * - Supports dual indexing for m2o/poly fields (by ID for saved, by instance for unsaved)
 * - Automatically maintains indexes when fields are updated via setField()
 */
export class IndexManager {
  readonly #indexes: Map<EntityTag, Map<FieldName, FieldIndexEntry>> = new Map();

  /** @return if we should index entities of this type/count. */
  shouldIndexType(entityCount: number): boolean {
    return entityCount >= indexThreshold;
  }

  /** Visible for testing. */
  isIndexed(tagName: string): boolean {
    return this.#indexes.has(tagName);
  }

  /** Enables indexing for an entity type and builds indexes for the requested fields. */
  enableIndexingForType<T extends Entity>(meta: EntityMetadata<T>, entities: T[], where: object): void {
    const { tagName } = meta;
    if (!this.#indexes.has(tagName)) {
      this.#indexes.set(tagName, new Map());
    }

    const fieldNames = Object.keys(where);
    const fieldIndexes = this.#indexes.get(tagName)!;
    const missingFieldNames = fieldNames.filter((fieldName) => !fieldIndexes.has(fieldName));
    if (missingFieldNames.length === 0) return;

    // If subtypes are involved, group by each subtype
    if (meta.baseType || meta.subTypes.length > 0) {
      [...groupBy(entities, (e) => getMetadata(e)).entries()].forEach(([meta, entities]) => {
        this.addEntitiesToIndex(meta, entities, missingFieldNames);
      });
    } else {
      this.addEntitiesToIndex(meta, entities, missingFieldNames);
    }
  }

  /** Updates indexes when a field value changes. */
  maybeUpdateFieldIndex(entity: Entity, fieldName: string, oldValue: any, newValue: any): void {
    // Fast return for the common case, which is no indexing
    if (this.#indexes.size === 0) return;

    const meta = getMetadata(entity);
    const fieldIndexes = this.#indexes.get(meta.tagName);
    if (!fieldIndexes) return; // Type not indexed

    const fieldIndex = fieldIndexes.get(fieldName)?.index;
    if (!fieldIndex) return; // Field is not indexed

    fieldIndex.remove(oldValue, entity);
    fieldIndex.add(newValue, entity);
  }

  /**
   * Finds entities matching the given where clause using indexes.
   *
   * Returns the raw candidate set (possibly a live internal index set, so do not mutate it);
   * the caller applies its own subtype/deleted filtering while building the final array.
   */
  findMatching<T extends Entity>(meta: EntityMetadata<T>, entities: T[], where: any): ReadonlySet<T> {
    const { tagName } = meta;
    if (!this.#indexes.has(tagName)) {
      throw new Error(`${meta.type} is not indexed`);
    }
    const fieldIndexes = this.#indexes.get(tagName)!;
    // Start with all entities of the 1st condition, then intersect (AND) each subsequent field in `where`
    let candidates: Set<Entity> | undefined;
    for (const [fieldName, value] of Object.entries(where)) {
      this.indexUnindexedEntities(entities, fieldName);
      const fieldCandidates = fieldIndexes.get(fieldName)?.index.get(value);
      if (!candidates) {
        candidates = fieldCandidates ?? emptySet; // This is the 1st clause
      } else {
        candidates = fieldCandidates ? intersectSets(candidates, fieldCandidates) : emptySet;
      }
      // Early exit if no candidates remain
      if (candidates.size === 0) break;
    }
    if (candidates === undefined) {
      throw new Error(`Expected where clause with at least one condition`);
    }
    return candidates as unknown as ReadonlySet<T>;
  }

  // `entities` should all be of the exact same subtype
  private addEntitiesToIndex(meta: EntityMetadata, entities: Entity[], fieldNames: string[]): void {
    const { tagName } = meta;
    const indexes = this.#indexes.get(tagName)!;
    // Iterate over each field so we can do a shared fieldIndex lookup
    for (const fieldName of fieldNames) {
      const field = meta.allFields[fieldName];
      if (!field) continue;
      let entry = indexes.get(fieldName);
      if (!entry) {
        entry = { field, index: new FieldIndex(), indexedCount: 0 };
        indexes.set(fieldName, entry);
      }
      for (const entity of entities) {
        const value = getFieldValue(entity, fieldName, entry.field);
        entry.index.add(value, entity);
      }
      entry.indexedCount = entities.length;
    }
  }

  /** Lazily indexes newly-registered entities only for fields that are queried. */
  private indexUnindexedEntities<T extends Entity>(entities: T[], fieldName: string): void {
    const first = entities[0];
    if (first === undefined) return;

    const meta = getMetadata(first);
    const entry = this.#indexes.get(meta.tagName)?.get(fieldName);
    if (entry === undefined || entry.indexedCount === entities.length) return;

    for (let i = entry.indexedCount; i < entities.length; i++) {
      const entity = entities[i];
      const value = getFieldValue(entity, fieldName, entry.field);
      entry.index.add(value, entity);
    }
    entry.indexedCount = entities.length;
  }
}

// Use the same field access pattern as entityMatches
function getFieldValue(entity: Entity, fieldName: string, field: Field): any {
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
    // Treat null and undefined as equivalent for unset relations
    if (value === null) value = undefined;
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
  const [smaller, larger] = set1.size <= set2.size ? [set1, set2] : [set2, set1];
  const result = new Set<T>();
  for (const item of smaller) {
    if (larger.has(item)) {
      result.add(item);
    }
  }
  return result;
}
