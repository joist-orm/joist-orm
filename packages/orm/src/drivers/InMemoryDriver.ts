import Knex from "knex";
import { ManyToManyCollection, OneToManyCollection, OneToOneReference } from "../collections";
import { JoinRow } from "../collections/ManyToManyCollection";
import { Entity, EntityConstructor, EntityManager, EntityMetadata, getMetadata } from "../EntityManager";
import { deTagId, keyToNumber, keyToString, maybeResolveReferenceToId, unsafeDeTagIds } from "../keys";
import { FilterAndSettings } from "../QueryBuilder";
import { JoinRowTodo, Todo } from "../Todo";
import { partition } from "../utils";
import { Driver } from "./driver";

export class InMemoryDriver implements Driver {
  // Map from table name --> string untagged id --> record
  private data: Record<string, Record<number, any>> = {};

  select(tableName: string): readonly any[] {
    return Object.values(this.data[tableName] || {});
  }

  insert(tableName: string, row: any): void {
    // Purposefully assign row.id as a side-effect
    row.id ||= this.nextId(tableName);
    this.rowsOfTable(tableName)[row.id] = { ...row }; // Make a copy
  }

  update(tableName: string, row: any): void {
    const existingRow = this.rowsOfTable(tableName)[row.id];
    this.rowsOfTable(tableName)[row.id] = { ...existingRow, ...row };
  }

  delete(tableName: string, id: number): void {
    delete this.rowsOfTable(tableName)[id];
  }

  clear(): void {
    this.data = {};
  }

  find<T extends Entity>(type: EntityConstructor<T>, queries: readonly FilterAndSettings<T>[]): Promise<unknown[][]> {
    return Promise.resolve([]);
  }

  async flushEntities(todos: Record<string, Todo>): Promise<void> {
    const updatedAt = new Date();
    Object.entries(todos).forEach(([_, todo]) => {
      todo.inserts.forEach((i) => {
        const row: Record<string, any> = {};
        todo.metadata.columns.forEach((c) => {
          row[c.columnName] = c.serde.mapToDb(i.__orm.data[c.fieldName]) ?? null;
        });
        row.id = this.nextId(todo.metadata.tableName);
        this.rowsOfTable(todo.metadata.tableName)[row.id] = row;
        i.__orm.data["id"] = keyToString(todo.metadata, row.id);
      });
      todo.updates.forEach((u) => {
        // TODO Do this in EntityManager instead of the drivers
        u.__orm.data["updatedAt"] = updatedAt;
        const id = deTagId(todo.metadata, u.idOrFail);
        const row: Record<string, any> = {};
        todo.metadata.columns.forEach((c) => {
          row[c.columnName] = c.serde.mapToDb(u.__orm.data[c.fieldName]) ?? null;
        });
        this.rowsOfTable(todo.metadata.tableName)[id] = row;
      });
      todo.deletes.forEach((d) => {
        const id = deTagId(todo.metadata, d.idOrFail);
        delete this.rowsOfTable(todo.metadata.tableName)[id];
        d.__orm.deleted = "deleted";
      });
    });
  }

  async flushJoinTables(joinRows: Record<string, JoinRowTodo>): Promise<void> {
    for (const [joinTableName, { m2m, newRows, deletedRows }] of Object.entries(joinRows)) {
      newRows.forEach((row) => {
        const { id, created_at, m2m, ...fkColumns } = row;
        // The rows in EntityManager.joinRows point to entities, change those to integers
        Object.keys(fkColumns).forEach((key) => {
          const meta = key == m2m.columnName ? getMetadata(m2m.entity) : m2m.otherMeta;
          fkColumns[key] = keyToNumber(meta, maybeResolveReferenceToId(fkColumns[key]));
        });
        this.insert(joinTableName, fkColumns);
        row.id = fkColumns.id as number;
      });

      // `remove`s that were done against unloaded ManyToManyCollections will not have row ids
      const [haveIds, noIds] = partition(deletedRows, (r) => r.id !== -1);

      haveIds.forEach((row) => this.delete(joinTableName, row.id!));

      noIds.forEach((noIdRow) => {
        const rows = Object.values(this.rowsOfTable(joinTableName));
        rows
          .filter((row) => {
            const a =
              String(row[m2m.columnName]) === deTagId(m2m.meta, maybeResolveReferenceToId(noIdRow[m2m.columnName])!);
            const b =
              String(row[m2m.otherColumnName]) ===
              deTagId(m2m.otherMeta, maybeResolveReferenceToId(noIdRow[m2m.otherColumnName])!);
            return a || b;
          })
          .forEach((found) => this.delete(joinTableName, found.id));
      });
    }
  }

  async load<T extends Entity>(meta: EntityMetadata<T>, untaggedIds: readonly string[]): Promise<unknown[]> {
    const rows = Object.values(this.data[meta.tableName] || {});
    return rows.filter((row) => untaggedIds.includes(String(row["id"])));
  }

  async loadManyToMany<T extends Entity, U extends Entity>(
    collection: ManyToManyCollection<T, U>,
    keys: readonly string[],
  ): Promise<JoinRow[]> {
    const ids: Record<string, string[]> = {};
    keys.forEach((key) => {
      const [column, id] = key.split("=");
      (ids[column] ||= []).push(unsafeDeTagIds([id])[0]);
    });
    const rows = Object.values(this.rowsOfTable(collection.joinTableName));
    return rows.filter((row) => {
      return Object.entries(ids).some(([column, ids]) => ids.includes(String(row[column])));
    });
  }

  async loadOneToMany<T extends Entity, U extends Entity>(
    collection: OneToManyCollection<T, U>,
    untaggedIds: readonly string[],
  ): Promise<unknown[]> {
    const rows = Object.values(this.rowsOfTable(collection.otherMeta.tableName));
    return rows.filter((row) => untaggedIds.includes(String(row[collection.otherColumnName])));
  }

  async loadOneToOne<T extends Entity, U extends Entity>(
    reference: OneToOneReference<T, U>,
    untaggedIds: readonly string[],
  ): Promise<unknown[]> {
    const rows = Object.values(this.rowsOfTable(reference.otherMeta.tableName));
    return rows.filter((row) => untaggedIds.includes(String(row[reference.otherColumnName])));
  }

  transaction<T>(
    em: EntityManager,
    fn: (txn: Knex.Transaction) => Promise<T>,
    isolationLevel?: "serializable",
  ): Promise<T> {
    return fn(undefined!);
  }

  private rowsOfTable(tableName: string): Record<string, any> {
    return (this.data[tableName] ||= {});
  }

  private nextId(tableName: string): number {
    return Object.values(this.data[tableName] || {}).length + 1;
  }
}
