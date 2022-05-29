import { Knex } from "knex";
import { ManyToManyLargeCollection, OneToManyLargeCollection } from "src/relations";
import { Entity } from "../Entity";
import { EntityConstructor, EntityManager } from "../EntityManager";
import { EntityMetadata } from "../EntityMetadata";
import { FilterAndSettings } from "../QueryBuilder";
import { JoinRow, ManyToManyCollection } from "../relations/ManyToManyCollection";
import { OneToManyCollection } from "../relations/OneToManyCollection";
import { OneToOneReferenceImpl } from "../relations/OneToOneReference";
import { JoinRowTodo, Todo } from "../Todo";

/** Isolates all SQL calls that joist needs to make to fetch/save data. */
export interface Driver {
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

  loadOneToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: OneToManyCollection<T, U>,
    untaggedIds: readonly string[],
  ): Promise<unknown[]>;

  findOneToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: OneToManyCollection<T, U> | OneToManyLargeCollection<T, U>,
    // encoded tuples of `id=2,bar_id=3`
    untaggedIds: readonly string[],
  ): Promise<unknown[]>;

  loadOneToOne<T extends Entity, U extends Entity>(
    em: EntityManager,
    reference: OneToOneReferenceImpl<T, U>,
    untaggedIds: readonly string[],
  ): Promise<unknown[]>;

  find<T extends Entity>(
    em: EntityManager,
    type: EntityConstructor<T>,
    queries: readonly FilterAndSettings<T>[],
  ): Promise<unknown[][]>;

  transaction<T>(
    em: EntityManager,
    fn: (txn: Knex.Transaction) => Promise<T>,
    isolationLevel?: "serializable",
  ): Promise<T>;

  flushEntities(em: EntityManager, todos: Record<string, Todo>): Promise<void>;

  flushJoinTables(em: EntityManager, joinRows: Record<string, JoinRowTodo>): Promise<void>;
}
