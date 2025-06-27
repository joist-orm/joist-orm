import { Entity, isEntity } from "./Entity";
import { EntityMetadata, getMetadata, isManyToOneField, isPolymorphicField } from "./EntityMetadata";
import { ManyToOneReference, PolymorphicReference, isLoadedReference } from "./relations";

type FieldValue = any;
type FieldName = string;
type EntityTag = string;

// Index structure: EntityType -> FieldName -> FieldValue -> Set<Entity>
type FieldIndex = Map<FieldValue, Set<Entity>>;
type EntityFieldIndexes = Map<FieldName, FieldIndex>;

// Special indexes for m2o fields that can be either saved (id-based) or unsaved (instance-based)
type M2oIndex = {
  byId: Map<string, Set<Entity>>; // For saved entities: id -> entities
  byInstance: Map<Entity, Set<Entity>>; // For unsaved entities: entity instance -> entities
  byNull: Set<Entity>; // For null/undefined values
};

/**
 * IndexManager provides field-based indexing for entity queries to avoid O(n) linear scans of `em.entities`.
 *
 * Key features:
 * - Only indexes entity types with >1000 entities to avoid overhead for small datasets
 * - Supports dual indexing for m2o/poly fields (by ID for saved, by instance for unsaved)
 * - Automatically maintains indexes when fields are updated via setField()
 */
export class IndexManager {
  readonly #indexes: Map<EntityTag, EntityFieldIndexes> = new Map();
  readonly #m2oIndexes: Map<EntityTag, Map<FieldName, M2oIndex>> = new Map();
  readonly indexedTypes: Set<EntityTag> = new Set();
  readonly #indexThreshold = 1_000;

  /** @return if we should index entities of this type/count. */
  shouldIndexType(entityCount: number): boolean {
    return entityCount >= this.#indexThreshold;
  }

  /**
   * Enables indexing for an entity type and builds initial indexes.
   */
  enableIndexingForType<T extends Entity>(entityType: any, entities: T[]): void {
    const typeName = entityType.name;

    if (this.indexedTypes.has(typeName)) {
      return; // Already indexed
    }

    this.indexedTypes.add(typeName);
    const meta = getMetadata(entityType);

    // Initialize index structures
    this.#indexes.set(typeName, new Map());
    this.#m2oIndexes.set(typeName, new Map());

    // Build indexes for all entities of this type
    for (const entity of entities) {
      this.addEntityToIndexes(entity, meta);
    }
  }

  /**
   * Disables indexing for an entity type (when count drops below threshold).
   */
  disableIndexingForType(entityType: any): void {
    const typeName = entityType.name;
    this.indexedTypes.delete(typeName);
    this.#indexes.delete(typeName);
    this.#m2oIndexes.delete(typeName);
  }

  /**
   * Adds an entity to all relevant indexes.
   */
  addEntity<T extends Entity>(entity: T): void {
    const meta = getMetadata(entity);
    const typeName = meta.type;

    if (!this.indexedTypes.has(typeName)) {
      return; // Type not indexed
    }

    this.addEntityToIndexes(entity, meta);
  }

  /**
   * Removes an entity from all relevant indexes.
   */
  removeEntity<T extends Entity>(entity: T): void {
    const meta = getMetadata(entity);
    const typeName = meta.type;

    if (!this.indexedTypes.has(typeName)) {
      return; // Type not indexed
    }

    this.removeEntityFromIndexes(entity, meta);
  }

  /**
   * Updates indexes when a field value changes.
   */
  updateFieldIndex<T extends Entity>(entity: T, fieldName: string, oldValue: any, newValue: any): void {
    const meta = getMetadata(entity);
    const typeName = meta.type;

    if (!this.indexedTypes.has(typeName)) {
      return; // Type not indexed
    }

    const field = meta.allFields[fieldName];
    if (!field) return;

    // Remove from old value index
    this.removeFromFieldIndex(entity, meta, fieldName, oldValue);

    // Add to new value index
    this.addToFieldIndex(entity, meta, fieldName, newValue);
  }

  /**
   * Finds entities matching the given where clause using indexes.
   * Returns null if the type is not indexed (fallback to linear search).
   */
  findMatching<T extends Entity>(entityType: any, where: any): T[] | null {
    const typeName = entityType.name;

    if (!this.indexedTypes.has(typeName)) {
      return null; // Not indexed, use linear search
    }

    const typeIndexes = this.#indexes.get(typeName)!;
    const typeM2oIndexes = this.#m2oIndexes.get(typeName)!;

    // Start with all entities, then intersect with each field constraint
    let candidates: Set<Entity> | null = null;

    for (const [fieldName, value] of Object.entries(where)) {
      const fieldCandidates = this.getFieldMatches(typeIndexes, typeM2oIndexes, fieldName, value);

      if (candidates === null) {
        candidates = fieldCandidates;
      } else {
        // Intersect with previous candidates
        candidates = this.intersectSets(candidates, fieldCandidates);
      }

      // Early exit if no candidates remain
      if (candidates.size === 0) {
        break;
      }
    }

    return candidates ? (Array.from(candidates) as T[]) : [];
  }

  private addEntityToIndexes<T extends Entity>(entity: T, meta: EntityMetadata): void {
    const typeName = meta.type;
    const typeIndexes = this.#indexes.get(typeName)!;
    const typeM2oIndexes = this.#m2oIndexes.get(typeName)!;

    // Index all fields
    for (const [fieldName, field] of Object.entries(meta.allFields)) {
      try {
        const value = this.getFieldValue(entity, fieldName);
        this.addToFieldIndex(entity, meta, fieldName, value);
      } catch (e) {
        // Skip fields that can't be read (e.g., unloaded references)
        continue;
      }
    }
  }

  private removeEntityFromIndexes<T extends Entity>(entity: T, meta: EntityMetadata): void {
    const typeName = meta.type;

    // Remove from all field indexes
    for (const [fieldName, field] of Object.entries(meta.allFields)) {
      try {
        const value = this.getFieldValue(entity, fieldName);
        this.removeFromFieldIndex(entity, meta, fieldName, value);
      } catch (e) {
        // Skip fields that can't be read
        continue;
      }
    }
  }

  private addToFieldIndex<T extends Entity>(entity: T, meta: EntityMetadata, fieldName: string, value: any): void {
    const typeName = meta.type;
    const field = meta.allFields[fieldName];
    if (!field) return;

    if (isManyToOneField(field) || isPolymorphicField(field)) {
      this.addToM2oIndex(entity, typeName, fieldName, value);
    } else {
      this.addToRegularIndex(entity, typeName, fieldName, value);
    }
  }

  private removeFromFieldIndex<T extends Entity>(entity: T, meta: EntityMetadata, fieldName: string, value: any): void {
    const typeName = meta.type;
    const field = meta.allFields[fieldName];
    if (!field) return;

    if (isManyToOneField(field) || isPolymorphicField(field)) {
      this.removeFromM2oIndex(entity, typeName, fieldName, value);
    } else {
      this.removeFromRegularIndex(entity, typeName, fieldName, value);
    }
  }

  private addToRegularIndex(entity: Entity, typeName: string, fieldName: string, value: any): void {
    const typeIndexes = this.#indexes.get(typeName)!;

    if (!typeIndexes.has(fieldName)) {
      typeIndexes.set(fieldName, new Map());
    }

    const fieldIndex = typeIndexes.get(fieldName)!;
    if (!fieldIndex.has(value)) {
      fieldIndex.set(value, new Set());
    }

    fieldIndex.get(value)!.add(entity);
  }

  private removeFromRegularIndex(entity: Entity, typeName: string, fieldName: string, value: any): void {
    const typeIndexes = this.#indexes.get(typeName);
    if (!typeIndexes) return;

    const fieldIndex = typeIndexes.get(fieldName);
    if (!fieldIndex) return;

    const valueSet = fieldIndex.get(value);
    if (valueSet) {
      valueSet.delete(entity);
      if (valueSet.size === 0) {
        fieldIndex.delete(value);
      }
    }
  }

  private addToM2oIndex(entity: Entity, typeName: string, fieldName: string, value: any): void {
    const typeM2oIndexes = this.#m2oIndexes.get(typeName)!;

    if (!typeM2oIndexes.has(fieldName)) {
      typeM2oIndexes.set(fieldName, {
        byId: new Map(),
        byInstance: new Map(),
        byNull: new Set(),
      });
    }

    const m2oIndex = typeM2oIndexes.get(fieldName)!;

    if (value === null || value === undefined) {
      m2oIndex.byNull.add(entity);
    } else if (isEntity(value)) {
      if (value.isNewEntity) {
        // Unsaved entity - index by instance
        if (!m2oIndex.byInstance.has(value)) {
          m2oIndex.byInstance.set(value, new Set());
        }
        m2oIndex.byInstance.get(value)!.add(entity);
      } else {
        // Saved entity - index by ID
        const id = value.idTaggedMaybe || value.id;
        if (id) {
          const idStr = String(id);
          if (!m2oIndex.byId.has(idStr)) {
            m2oIndex.byId.set(idStr, new Set());
          }
          m2oIndex.byId.get(idStr)!.add(entity);
        }
      }
    } else if (typeof value === "string") {
      // Direct ID reference
      if (!m2oIndex.byId.has(value)) {
        m2oIndex.byId.set(value, new Set());
      }
      m2oIndex.byId.get(value)!.add(entity);
    }
  }

  private removeFromM2oIndex(entity: Entity, typeName: string, fieldName: string, value: any): void {
    const typeM2oIndexes = this.#m2oIndexes.get(typeName);
    if (!typeM2oIndexes) return;

    const m2oIndex = typeM2oIndexes.get(fieldName);
    if (!m2oIndex) return;

    if (value === null || value === undefined) {
      m2oIndex.byNull.delete(entity);
    } else if (isEntity(value)) {
      if (value.isNewEntity) {
        const instanceSet = m2oIndex.byInstance.get(value);
        if (instanceSet) {
          instanceSet.delete(entity);
          if (instanceSet.size === 0) {
            m2oIndex.byInstance.delete(value);
          }
        }
      } else {
        const id = value.idTaggedMaybe || value.id;
        if (id) {
          const idStr = String(id);
          const idSet = m2oIndex.byId.get(idStr);
          if (idSet) {
            idSet.delete(entity);
            if (idSet.size === 0) {
              m2oIndex.byId.delete(idStr);
            }
          }
        }
      }
    } else if (typeof value === "string") {
      const idSet = m2oIndex.byId.get(value);
      if (idSet) {
        idSet.delete(entity);
        if (idSet.size === 0) {
          m2oIndex.byId.delete(value);
        }
      }
    }
  }

  private getFieldMatches(
    typeIndexes: EntityFieldIndexes,
    typeM2oIndexes: Map<FieldName, M2oIndex>,
    fieldName: string,
    value: any,
  ): Set<Entity> {
    // Check if it's an m2o field
    const m2oIndex = typeM2oIndexes.get(fieldName);
    if (m2oIndex) {
      return this.getM2oMatches(m2oIndex, value);
    }

    // Regular field index
    const fieldIndex = typeIndexes.get(fieldName);
    if (!fieldIndex) {
      return new Set(); // No index for this field
    }

    return fieldIndex.get(value) || new Set();
  }

  private getM2oMatches(m2oIndex: M2oIndex, value: any): Set<Entity> {
    if (value === null || value === undefined) {
      return new Set(m2oIndex.byNull);
    } else if (isEntity(value)) {
      if (value.isNewEntity) {
        return m2oIndex.byInstance.get(value) || new Set();
      } else {
        const id = value.idTaggedMaybe || value.id;
        return id ? m2oIndex.byId.get(String(id)) || new Set() : new Set();
      }
    } else if (typeof value === "string") {
      return m2oIndex.byId.get(value) || new Set();
    }

    return new Set();
  }

  private intersectSets(set1: Set<Entity>, set2: Set<Entity>): Set<Entity> {
    const result = new Set<Entity>();
    for (const entity of set1) {
      if (set2.has(entity)) {
        result.add(entity);
      }
    }
    return result;
  }

  private getFieldValue(entity: Entity, fieldName: string): any {
    // Use the same field access pattern as entityMatches
    const meta = getMetadata(entity);
    const field = meta.allFields[fieldName];
    if (!field) return undefined;

    const fn = fieldName as keyof Entity;
    switch (field.kind) {
      case "primaryKey":
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
}
