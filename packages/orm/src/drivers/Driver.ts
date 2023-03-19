import { Entity } from "../Entity";
import { FilterAndSettings } from "../EntityFilter";
import { EntityConstructor, EntityManager, MaybeAbstractEntityConstructor } from "../EntityManager";
import { EntityMetadata } from "../EntityMetadata";
import { ParsedFindQuery } from "../QueryParser";
import {
  ManyToManyCollection,
  ManyToManyLargeCollection,
  OneToManyCollection,
  OneToManyLargeCollection,
  OneToOneReferenceImpl,
} from "../relations";
import { JoinRow } from "../relations/ManyToManyCollection";
import { JoinRowTodo, Todo } from "../Todo";

/**
 * Isolates all SQL calls that joist needs to make to fetch/save data.
 *
 * @typeparam Q The low-level connection type for the driver, i.e. `Knex`.
 * @typeparam T The low-level transaction type for the driver, i.e. `Knex.Transaction`.
 */
export interface Driver<Q, TXN> {
  /** Bulk loads all rows from the table(s) for `meta`, for all `untaggedIds`. */
  load<T extends Entity>(
    em: EntityManager,
    meta: EntityMetadata<T>,
    untaggedIds: readonly string[],
  ): Promise<unknown[]>;

  /** Loads a given m2m relation for potentially multiple entities. */
  loadManyToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: ManyToManyCollection<T, U>,
    // encoded tuples of `foo_id=2`, `bar_id=3`
    keys: readonly string[],
  ): Promise<JoinRow[]>;

  /** Just finds presence in a m2m w/o loading the full relation. */
  findManyToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: ManyToManyCollection<T, U> | ManyToManyLargeCollection<T, U>,
    // encoded tuples of `foo_id=2,bar_id=3`, `bar_id=4,foo_id=5`
    keys: readonly string[],
  ): Promise<JoinRow[]>;

  /** Bulk loads all rows in a m2o, for all entities in `untaggedIds`. */
  loadOneToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: OneToManyCollection<T, U>,
    untaggedIds: readonly string[],
  ): Promise<unknown[]>;

  /** Bulk loads selective rows in a m2o, for all entities encoded in `untaggedIds`. */
  findOneToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: OneToManyCollection<T, U> | OneToManyLargeCollection<T, U>,
    // encoded tuples of `id=2,bar_id=3`
    untaggedIds: readonly string[],
  ): Promise<unknown[]>;

  /** Batch loads o2o rows, for all entities in `untaggedIds`. */
  loadOneToOne<T extends Entity, U extends Entity>(
    em: EntityManager,
    reference: OneToOneReferenceImpl<T, U>,
    untaggedIds: readonly string[],
  ): Promise<unknown[]>;

  find<T extends Entity>(
    em: EntityManager,
    type: MaybeAbstractEntityConstructor<T>,
    queries: readonly FilterAndSettings<T>[],
  ): Promise<unknown[][]>;

  /**
   * Builds low-level SQL/knex queries, similar to `EntityManager.find`, for further customization.
   *
   * @param em The `EntityManager` that is building the query.
   * @param type The primary entity type that `filter` is based on.
   * @param filter[keepAliases] Marks specific aliases to keep in the query, even if they are not used
   *   by any selects or conditions, i.e. because you plan on adding your own joins/conditions
   *   against the `QueryBuilder` directly.
   * @param filter[pruneJoins] Disables removing any unused joins, i.e. because you plan on adding your
   *   own joins/conditions against the `QueryBuilder` directly.
   */
  buildQuery<T extends Entity>(
    em: EntityManager,
    type: EntityConstructor<T>,
    filter: FilterAndSettings<T> & { pruneJoins?: boolean; keepAliases?: string[] },
  ): Q;

  /** Executes a low-level `ParsedFindQuery` against the database and returns the rows. */
  executeFind(
    em: EntityManager,
    parsed: ParsedFindQuery,
    settings: { limit?: number; offset?: number },
  ): Promise<any[]>;

  transaction<T>(em: EntityManager, fn: (txn: TXN) => Promise<T>, isolationLevel?: "serializable"): Promise<T>;

  assignNewIds(em: EntityManager, todos: Record<string, Todo>): Promise<void>;

  flushEntities(em: EntityManager, todos: Record<string, Todo>): Promise<void>;

  flushJoinTables(em: EntityManager, joinRows: Record<string, JoinRowTodo>): Promise<void>;
}
