import { getInstanceData } from "../BaseEntity";
import { BatchLoader } from "../batchloaders/BatchLoader";
import { Entity } from "../Entity";
import { EntityManager } from "../EntityManager";
import { EntityMetadata, getMetadata, PrimitiveField } from "../EntityMetadata";
import { setField } from "../fields";
import { keyToNumber, tagId } from "../keys";
import { kqDot } from "../keywords";
import { lazyField } from "../newEntity";
import { ParsedFindQuery } from "../QueryParser";
import { PojoRowData } from "../RowData";
import { applySetOnEntity } from "../serde";
import { abbreviation } from "../utils";
import { AbstractPropertyImpl } from "./AbstractPropertyImpl";
import { LoadedProperty, Property, PropertyT } from "./hasProperty";

export const lazyColumnLoadOperation = "lazy-column-load";

/**
 * The "original value" of an unloaded lazy column: unknown, and never equal to any set value.
 *
 * Seeded into `__orm.data` by `LazyFieldImpl.set` so that setting an unloaded column (even to
 * `undefined`) always registers as a change, i.e. instead of comparing equal to the `undefined`
 * that the excluded column would otherwise read as.
 */
export const notLoadedValue = Symbol("notLoadedValue");

/**
 * A single-column primitive (i.e. a large `jsonb`/`text`) that is deliberately excluded from the
 * entity's default SELECT and only fetched from the database on demand.
 *
 * I.e. `await author.someBigColumn.load()`, or synchronously via `.get` after `em.populate`.
 */
export interface LazyField<T extends Entity, V> extends Property<T, V> {
  load(opts?: { forceReload?: boolean }): Promise<V>;
  /** Sets the value in memory (dirtied for the next flush), i.e. without loading the current db value first. */
  set(value: V): void;
}

/** Creates a `LazyField` for a column that codegen has marked `lazy: true`. */
export function hasLazyField<T extends Entity, V>(): LazyField<T, V> {
  return lazyField((entity: T, fieldName: string) => new LazyFieldImpl<T, V>(entity, fieldName));
}

export class LazyFieldImpl<T extends Entity, V> extends AbstractPropertyImpl<T> implements LazyField<T, V> {
  #fieldName: string;
  #loaded = false;
  #loadPromise: Promise<V> | undefined;

  constructor(entity: T, fieldName: string) {
    super(entity);
    this.#fieldName = fieldName;
  }

  /** Fetches this column from the database (batched across peers) and caches it on the entity. */
  load(opts?: { forceReload?: boolean }): Promise<V> {
    const { entity } = this;
    if (opts?.forceReload) {
      this.#loaded = false;
      this.#loadPromise = undefined;
    }
    if (this.isLoaded) return Promise.resolve(this.#value);
    const meta = getMetadata(entity);
    return (this.#loadPromise ??= lazyColumnBatchLoader(entity.em, meta, this.#fieldName)
      .load(entity.idTagged)
      .then(() => {
        this.#loaded = true;
        return this.#value;
      }));
  }

  get get(): V {
    if (!this.isLoaded) {
      throw new Error(`${this.#fieldName} has not been loaded yet, use '.load()' or an 'em.populate' hint`);
    }
    return this.#value;
  }

  /** Sets the value in memory; the column is dirtied and written on the next `em.flush`. */
  set(value: V): void {
    if (this.isLoaded) {
      setField(this.entity, this.#fieldName, value);
    } else {
      // Seed `notLoadedValue` as the current value so the set always registers as a change against
      // the unknown db value: an unloaded column otherwise reads as `undefined`, which would make
      // `set(undefined)` a silent no-op, and a later `set(undefined)` falsely revert to clean.
      const { data } = getInstanceData(this.entity);
      data[this.#fieldName] = notLoadedValue;
      try {
        setField(this.entity, this.#fieldName, value);
      } catch (e) {
        // Don't leak the marker as a readable value, i.e. if setting on a deleted entity throws
        delete data[this.#fieldName];
        throw e;
      }
    }
    this.#loaded = true;
  }

  get isLoaded(): boolean {
    // New entities keep their value in-memory, so there's nothing to lazy-load.
    if (getInstanceData(this.entity).isOrWasNew) return true;
    return this.#loaded;
  }

  /** Called after em.flush to invalidate the cached value, since the db state may have changed. */
  resetAfterFlush(): void {
    this.#loaded = false;
    this.#loadPromise = undefined;
  }

  /** The domain value, which `load`/`set` keep in the entity's `__orm.data` like any other column. */
  get #value(): V {
    return getInstanceData(this.entity).data[this.#fieldName] as V;
  }

  [PropertyT] = undefined as any as T;
}

/** Type guard utility for determining if an entity field is a LazyField. */
export function isLazyField(maybe: any): maybe is LazyField<any, any> {
  return maybe instanceof LazyFieldImpl;
}

/** Type guard utility for determining if an entity field is a loaded LazyField. */
export function isLoadedLazyField(maybe: any): maybe is LazyField<any, any> & LoadedProperty<any, any> {
  return isLazyField(maybe) && maybe.isLoaded;
}

/** Batches `LazyField.load`s for the same column into a single `SELECT id, <column> ... WHERE id IN (...)`. */
function lazyColumnBatchLoader(em: EntityManager, meta: EntityMetadata, fieldName: string): BatchLoader<string> {
  return em.getBatchLoader(lazyColumnLoadOperation, `${meta.tableName}-${fieldName}`, async (taggedIds) => {
    const field = meta.allFields[fieldName] as PrimitiveField;
    const column = field.serde.columns[0];
    const alias = abbreviation(meta.tableName);
    const keys = taggedIds.map((id) => keyToNumber(meta, id));
    const query: ParsedFindQuery = {
      selects: [`${kqDot(alias, "id")} as id`, kqDot(alias, column.columnName)],
      tables: [{ alias, join: "primary", table: meta.tableName }],
      condition: {
        kind: "exp",
        op: "and",
        conditions: [{ kind: "column", alias, column: "id", dbType: meta.idDbType, cond: { kind: "in", value: keys } }],
      },
      orderBys: [],
    };
    const rows = await em["executeFind"](meta, lazyColumnLoadOperation, query, {});
    const rowData = new PojoRowData(rows);
    for (let i = 0; i < rows.length; i++) {
      const entity = em.findExistingInstance(tagId(meta, rows[i].id));
      if (entity) applySetOnEntity(field.serde, getInstanceData(entity).data, rowData, i);
    }
  });
}
