import Knex from "knex";
import { ManyToManyCollection, OneToManyCollection, OneToOneReference } from "../collections";
import { JoinRow } from "../collections/ManyToManyCollection";
import { Entity, EntityConstructor, EntityManager, EntityMetadata, getMetadata } from "../EntityManager";
import { deTagId, keyToNumber, keyToString, maybeResolveReferenceToId, unsafeDeTagIds } from "../keys";
import { FilterAndSettings, parseEntityFilter, parseValueFilter, ValueFilter } from "../QueryBuilder";
import { JoinRowTodo, Todo } from "../Todo";
import { fail, partition } from "../utils";
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

  async find<T extends Entity>(
    type: EntityConstructor<T>,
    queries: readonly FilterAndSettings<T>[],
  ): Promise<unknown[][]> {
    return queries.map((query) => {
      const meta = getMetadata(type);
      const rows = Object.values(this.rowsOfTable(meta.tableName));
      const matched = rows.filter((row) => rowMatches(this, meta, row, query.where));

      const sort = (meta: EntityMetadata<any>, orderBy: object, a: any, b: any): number => {
        const fieldName = Object.keys(orderBy)[0];
        const value = (orderBy as any)[fieldName];
        if (value !== "ASC" && value !== "DESC") {
          // I.e. value is something like `{ book: { author: { ... } }`
          const field = meta.fields.find((f) => f.fieldName === fieldName) || fail();
          if (field.kind === "m2o") {
            const newMeta = field.otherMetadata();
            const newA = this.rowsOfTable(newMeta.tableName)[a.id];
            const newB = this.rowsOfTable(newMeta.tableName)[b.id];
            return sort(newMeta, value, newA, newB);
          } else {
            throw new Error(`Unsupported order by field ${fieldName}`);
          }
        }
        const flip = value === "DESC" ? -1 : 1;
        const column = meta.columns.find((c) => c.fieldName === fieldName) || fail();
        const key = column.columnName;
        // TODO Handle sorting by more than just strings
        return a[key].localeCompare(b[key]) * flip;
      };

      const sorted = !query.orderBy ? matched : matched.sort((a, b) => sort(meta, query.orderBy as any, a, b));

      // TODO Handle limit

      return sorted;
    });
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

  rowsOfTable(tableName: string): Record<string, any> {
    return (this.data[tableName] ||= {});
  }

  private nextId(tableName: string): number {
    return Object.values(this.data[tableName] || {}).length + 1;
  }
}

/** In SQL `a !== null` is false. */
function notEqual(a: any, b: any): boolean {
  if (a === null || b === null) {
    return !(a === null && b === null);
  } else {
    return a !== b;
  }
}

const ops = {
  gt: (a: number, b: number) => a > b,
  gte: (a: number, b: number) => a >= b,
  lt: (a: number, b: number) => a < b,
  lte: (a: number, b: number) => a <= b,
  like: (a: any, b: any) => new RegExp(b.replace("%", ".*")).test(a),
  ilike: (a: any, b: any) => new RegExp(b.replace("%", ".*"), "i").test(a),
};

function rowMatches(driver: InMemoryDriver, meta: EntityMetadata<any>, row: any, where: unknown): boolean {
  return Object.entries(where as any).every(([fieldName, value]) => {
    const field = meta.fields.find((f) => f.fieldName === fieldName) || fail();
    // TODO Add column data to the fields
    const column = meta.columns.find((c) => c.fieldName === field.fieldName) || fail();
    const currentValue = row[column.columnName] ?? null;
    switch (field.kind) {
      case "primaryKey":
        // This is a lot like the "case primitive" but we detag the value
        const pkf = parseValueFilter(value as ValueFilter<any, any>);
        switch (pkf.kind) {
          case "eq":
            return currentValue === keyToNumber(meta, pkf.value as any);
          case "ne":
            return notEqual(currentValue, keyToNumber(meta, pkf.value as any));
          case "in":
            return pkf.value.map((v) => keyToNumber(meta, v as any)).includes(currentValue);
          default:
            throw new Error("Unsupported");
        }
      case "primitive":
      case "enum":
        let fn = (a: any) => a;
        if (field.kind === "enum") {
          fn = (v) => (field.enumDetailType as any).getByCode(v).id;
        }
        const filter = parseValueFilter(value as ValueFilter<any, any>);
        switch (filter.kind) {
          case "eq":
            return currentValue === fn(filter.value);
          case "ne":
            return notEqual(currentValue, fn(filter.value));
          case "in":
            return filter.value.map(fn).includes(currentValue);
          case "gt":
          case "gte":
          case "lt":
          case "lte":
          case "like":
          case "ilike":
            const a = currentValue;
            const b = fn(filter.value);
            const op = ops[filter.kind];
            return op(a, b);
          case "pass":
            return true;
          default:
            throw new Error("Unsupported");
        }
      case "m2o":
        const otherMeta = field.otherMetadata();
        const ef = parseEntityFilter(otherMeta, value);
        switch (ef.kind) {
          case "eq":
            return currentValue === ef.id;
          case "ne":
            return notEqual(currentValue, ef.id);
          case "in":
            return ef.ids.includes(currentValue);
          case "join":
            if (currentValue === null) {
              return false;
            }
            const otherRow = driver.rowsOfTable(otherMeta.tableName)[currentValue];
            return rowMatches(driver, otherMeta, otherRow, ef.subFilter);
          default:
            throw new Error("Unsupported");
        }
      default:
        throw new Error("Unsupported");
    }
  });
}
