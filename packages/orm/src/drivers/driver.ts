import Knex from "knex";
import { JoinRow, ManyToManyCollection } from "../collections/ManyToManyCollection";
import { OneToManyCollection } from "../collections/OneToManyCollection";
import { OneToOneReference } from "../collections/OneToOneReference";
import { Entity, EntityConstructor, EntityManager, EntityMetadata } from "../EntityManager";
import { FilterAndSettings } from "../QueryBuilder";
import { JoinRowTodo, Todo } from "../Todo";

/** Isolates all SQL calls that joist needs to make to fetch/save data. */
export interface Driver {
  load<T extends Entity>(
    em: EntityManager,
    meta: EntityMetadata<T>,
    untaggedIds: readonly string[],
  ): PromiseLike<unknown[]>;

  loadManyToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: ManyToManyCollection<T, U>,
    keys: readonly string[],
  ): PromiseLike<JoinRow[]>;

  loadOneToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: OneToManyCollection<T, U>,
    untaggedIds: readonly string[],
  ): PromiseLike<unknown[]>;

  loadOneToOne<T extends Entity, U extends Entity>(
    em: EntityManager,
    reference: OneToOneReference<T, U>,
    untaggedIds: readonly string[],
  ): PromiseLike<unknown[]>;

  find<T extends Entity>(
    em: EntityManager,
    type: EntityConstructor<T>,
    queries: readonly FilterAndSettings<T>[],
  ): PromiseLike<unknown[][]>;

  transaction<T>(
    em: EntityManager,
    fn: (txn: Knex.Transaction) => Promise<T>,
    isolationLevel?: "serializable",
  ): PromiseLike<T>;

  flushEntities(em: EntityManager, todos: Record<string, Todo>): Promise<void>;

  flushJoinTables(em: EntityManager, joinRows: Record<string, JoinRowTodo>): Promise<void>;
}
