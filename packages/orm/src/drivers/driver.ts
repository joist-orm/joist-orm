import Knex from "knex";
import { JoinRow, ManyToManyCollection } from "../collections/ManyToManyCollection";
import { OneToManyCollection } from "../collections/OneToManyCollection";
import { OneToOneReference } from "../collections/OneToOneReference";
import { Entity, EntityConstructor, EntityManager, EntityMetadata } from "../EntityManager";
import { FilterAndSettings } from "../QueryBuilder";
import { JoinRowTodo, Todo } from "../Todo";

/** Isolates all SQL calls that joist needs to make to fetch/save data. */
export interface Driver {
  load<T extends Entity>(meta: EntityMetadata<T>, ids: readonly string[]): Promise<unknown[]>;

  loadManyToMany<T extends Entity, U extends Entity>(
    collection: ManyToManyCollection<T, U>,
    keys: readonly string[],
  ): Promise<JoinRow[]>;

  loadOneToMany<T extends Entity, U extends Entity>(
    collection: OneToManyCollection<T, U>,
    ids: readonly string[],
  ): Promise<unknown[]>;

  loadOneToOne<T extends Entity, U extends Entity>(
    reference: OneToOneReference<T, U>,
    ids: readonly string[],
  ): Promise<unknown[]>;

  find<T extends Entity>(type: EntityConstructor<T>, queries: readonly FilterAndSettings<T>[]): Promise<unknown[][]>;

  transaction<T>(
    em: EntityManager,
    fn: (txn: Knex.Transaction) => Promise<T>,
    isolationLevel?: "serializable",
  ): Promise<T>;

  flushEntities(todos: Record<string, Todo>): Promise<void>;

  flushJoinTables(joinRows: Record<string, JoinRowTodo>): Promise<void>;
}
