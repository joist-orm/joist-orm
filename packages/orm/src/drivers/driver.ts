import Knex from "knex";
import { ManyToManyCollection } from "../collections/ManyToManyCollection";
import { OneToManyCollection } from "../collections/OneToManyCollection";
import { OneToOneReference } from "../collections/OneToOneReference";
import { Entity, EntityConstructor, EntityManager, EntityMetadata, FilterOf, OrderOf } from "../EntityManager";
import { JoinRowTodo, Todo } from "./EntityPersister";

export interface Driver {
  load<T extends Entity>(em: EntityManager, meta: EntityMetadata<T>, id: string): Promise<T | undefined>;

  loadManyToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: ManyToManyCollection<T, U>,
  ): Promise<U[]>;

  loadOneToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: OneToManyCollection<T, U>,
  ): Promise<U[]>;

  loadOneToOne<T extends Entity, U extends Entity>(
    em: EntityManager,
    reference: OneToOneReference<T, U>,
  ): Promise<U | undefined>;

  find<T extends Entity>(
    em: EntityManager,
    type: EntityConstructor<T>,
    where: FilterOf<T>,
    options?: { orderBy?: OrderOf<T>; limit?: number; offset?: number },
  ): Promise<unknown[]>;

  transaction<T>(
    em: EntityManager,
    fn: (txn: Knex.Transaction) => Promise<T>,
    isolationLevel?: "serializable",
  ): Promise<T>;

  flushEntities(todos: Record<string, Todo>): Promise<void>;

  flushJoinTables(joinRows: Record<string, JoinRowTodo>): Promise<void>;

  resetDataLoaderCache(): void;
}
