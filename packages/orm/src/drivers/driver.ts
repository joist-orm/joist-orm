import Knex from "knex";
import { JoinRow, ManyToManyCollection } from "../collections/ManyToManyCollection";
import { OneToManyCollection } from "../collections/OneToManyCollection";
import { OneToOneReference } from "../collections/OneToOneReference";
import { Entity, EntityConstructor, EntityManager, EntityMetadata, FilterOf, OrderOf } from "../EntityManager";
import { JoinRowTodo, Todo } from "./EntityPersister";
import { FilterAndSettings } from "../QueryBuilder";

export interface Driver {
  load<T extends Entity>(em: EntityManager, meta: EntityMetadata<T>, ids: readonly string[]): Promise<unknown[]>;

  loadManyToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: ManyToManyCollection<T, U>,
    keys: readonly string[],
  ): Promise<JoinRow[]>;

  loadOneToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: OneToManyCollection<T, U>,
    ids: readonly string[],
  ): Promise<unknown[]>;

  loadOneToOne<T extends Entity, U extends Entity>(
    em: EntityManager,
    reference: OneToOneReference<T, U>,
    ids: readonly string[],
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

  flushEntities(todos: Record<string, Todo>): Promise<void>;

  flushJoinTables(joinRows: Record<string, JoinRowTodo>): Promise<void>;
}
