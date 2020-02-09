import DataLoader from "dataloader";
import Knex, { JoinRaw } from "knex";
import { flushEntities, flushJoinTables } from "./EntityPersister";
import { getOrSet } from "./utils";
import { ColumnSerde } from "./serde";
import { Collection, LoadedCollection, LoadedReference, Reference } from "./index";
import { JoinRow } from "./collections/ManyToManyCollection";

export interface EntityConstructor<T> {
  new (em: EntityManager, opts?: Partial<T>): T;
}

export interface EntityOrmField {
  metadata: EntityMetadata<Entity>;
  data: Record<any, any>;
  dirty?: boolean;
  em: EntityManager;
}

export interface Entity {
  id: string | undefined;

  __orm: EntityOrmField;
}

type FilterQuery<T> = any;

/** Marks a given `T[P]` as the loaded/synchronous version of the collection. */
type MarkLoaded<T extends Entity, P extends keyof T> = T[P] extends Reference<T, infer U>
  ? LoadedReference<T, U>
  : T[P] extends Collection<T, infer U>
  ? LoadedCollection<T, U>
  : T[P];

/** Marks all references/collections of `T` as loaded, i.e. for newly instantiated entities. */
export type Loaded<T extends Entity> = {
  [P in keyof T]: MarkLoaded<T, P>;
};

export type LoaderCache = Record<string, DataLoader<any, any>>;

export class EntityManager {
  /// TODO Hide impl
  constructor(public knex: Knex) {}

  // TODO make private
  loaders: LoaderCache = {};
  private entities: Entity[] = [];
  // TODO make private
  joinRows: Record<string, JoinRow[]> = {};

  async find<T extends Entity>(type: EntityConstructor<T>, where: FilterQuery<T>): Promise<T[]> {
    return this.loaderForEntity(type).load(1);
  }

  /** Creates a new `type` and marks it as loaded, i.e. we know it's collections are all safe to access in memory. */
  create<T extends Entity>(type: EntityConstructor<T>, opts?: Partial<T>): Loaded<T> {
    return new type(this, opts) as Loaded<T>;
  }

  async load<T extends Entity>(type: EntityConstructor<T>, id: string): Promise<T> {
    if (typeof (id as any) !== "string") {
      throw new Error(`Expected ${id} to be a string`);
    }
    return this.findExistingInstance((type as any).metadata.type, id) || this.loaderForEntity(type).load(id);
  }

  /** Registers a newly-instantiated entity with our EntityManager; only called by entity constructors. */
  register(entity: Entity): void {
    if (entity.id && this.findExistingInstance(entity.__orm.metadata.type, entity.id) !== undefined) {
      throw new Error(`Entity ${entity} has a duplicate instance already loaded`);
    }
    this.entities.push(entity);
  }

  markDirty(entity: Entity): void {
    entity.__orm.dirty = true;
  }

  async flush(): Promise<void> {
    await flushEntities(this.knex, this.entities);
    await flushJoinTables(this.knex, this.joinRows);
  }

  private loaderForEntity<T extends Entity>(type: EntityConstructor<T>) {
    return getOrSet(this.loaders, type.name, () => {
      return new DataLoader<string, T>(async keys => {
        const meta = (type as any).metadata as EntityMetadata<T>;

        const rows = await this.knex
          .select("*")
          .from(meta.tableName)
          .whereIn("id", keys as string[]);

        const rowsById = new Map<string, T>();
        rows.forEach(row => {
          const entity = (new meta.cstr(this) as any) as T;
          meta.columns.forEach(c => c.serde.setOnEntity(entity.__orm.data, row));
          rowsById.set(entity.id!, entity);
        });

        return keys.map(k => rowsById.get(k) || new Error(`${type.name}#${k} not found`));
      });
    });
  }

  // Handles our Unit of Work-style look up / deduplication of entity instances.
  // TODO Hide private impl
  public findExistingInstance(type: string, id: string): Entity | undefined {
    return this.entities.find(e => e.__orm.metadata.type === type && e.id === id);
  }
}

export interface EntityMetadata<T extends Entity> {
  cstr: EntityConstructor<T>;
  type: string;
  tableName: string;
  // Eventually our dbType should go away to support N-column fields
  columns: Array<{ fieldName: string; columnName: string; dbType: string; serde: ColumnSerde }>;
  order: number;
}

export function isEntity(e: any): e is Entity {
  return e !== undefined && e instanceof Object && "id" in e && "__orm" in e;
}
