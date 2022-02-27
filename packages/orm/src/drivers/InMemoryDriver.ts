import { Knex } from "knex";
import { Entity, EntityConstructor, entityLimit, EntityManager, EntityMetadata, getMetadata } from "../EntityManager";
import { deTagId, keyToNumber, keyToString, maybeResolveReferenceToId, tagId, unsafeDeTagIds } from "../keys";
import { FilterAndSettings, parseEntityFilter, parseValueFilter, ValueFilter } from "../QueryBuilder";
import { ManyToManyCollection, OneToManyCollection, OneToOneReferenceImpl } from "../relations";
import { JoinRow } from "../relations/ManyToManyCollection";
import { hasSerde } from "../serde";
import { JoinRowTodo, Todo } from "../Todo";
import { fail, partition } from "../utils";
import { Driver } from "./driver";

export class InMemoryDriver implements Driver {
  // Map from table name --> string untagged id --> record
  private data: Record<string, Record<number, any>> = {};
  // This is a WIP/hacky way to try and expose to our tests the "number of queries"
  // that are made during a test; granted for in-memory mode that doesn't really matter
  // per se, but we have a lot of existing tests that cover batching behavior, and so
  // instead of skipping / conditionalizing all of those for "in memory or not", it seems
  // easier to have the driver provide a count of "basically a query" to the test suite.
  //
  // This is primarily for Joist's own internal test suite, and downstream applications
  // should not work about this, unless they have their own "assert # of queries made"
  // tests that want to run against both the pg driver and in memory driver.
  private onQuery: () => void;

  constructor(onQuery?: () => void) {
    this.onQuery = onQuery || (() => {});
  }

  select(tableName: string): readonly any[] {
    this.onQuery();
    return Object.values(this.data[tableName] || {});
  }

  insert(tableName: string, row: any): void {
    this.onQuery();
    // Purposefully assign row.id as a side-effect
    row.id ||= this.nextId(tableName);
    this.rowsOfTable(tableName)[row.id] = { ...row }; // Make a copy
  }

  update(tableName: string, row: any): void {
    this.onQuery();
    const existingRow = this.rowsOfTable(tableName)[row.id];
    this.rowsOfTable(tableName)[row.id] = { ...existingRow, ...row };
  }

  delete(tableName: string, id: number): void {
    this.onQuery();
    delete this.rowsOfTable(tableName)[id];
  }

  clear(): void {
    this.data = {};
  }

  async find<T extends Entity>(
    em: EntityManager,
    type: EntityConstructor<T>,
    queries: readonly FilterAndSettings<T>[],
  ): Promise<unknown[][]> {
    this.onQuery();
    return queries.map((query) => {
      const { where, orderBy, limit, offset = 0 } = query;
      const meta = getMetadata(type);
      const allRows = Object.values(this.rowsOfTable(meta.tableName));
      const matched = allRows.filter((row) => rowMatches(this, meta, row, where));
      const sorted = !orderBy ? matched : matched.sort((a, b) => sort(this, meta, orderBy as any, a, b));
      return ensureUnderLimit(sorted.slice(offset, offset + (limit ?? sorted.length)));
    });
  }

  async flushEntities(em: EntityManager, todos: Record<string, Todo>): Promise<void> {
    const updatedAt = new Date();

    // do our version of assign ids
    Object.entries(todos).forEach(([_, todo]) => {
      todo.inserts.forEach((i) => {
        const id = this.nextId(todo.metadata.tableName);
        i.__orm.data["id"] = keyToString(todo.metadata, id);
        this.rowsOfTable(todo.metadata.tableName)[id] = {};
      });
    });

    Object.entries(todos).forEach(([_, todo]) => {
      // Because our assign id step effectively inserts the row, we can handle
      // both inserts and updates with the same code path.
      [...todo.updates, ...todo.inserts].forEach((u) => {
        this.onQuery();
        // TODO Do this in EntityManager instead of the drivers
        u.__orm.data["updatedAt"] = updatedAt;
        const id = deTagId(todo.metadata, u.idOrFail);
        const row: Record<string, any> = {};
        Object.values(todo.metadata.fields)
          .filter(hasSerde)
          .flatMap((f) => f.serde.columns.map((c) => [f, c] as const))
          .forEach(([f, c]) => {
            // Kinda surprised mapToDb doesn't work here...
            row[c.columnName] = c.dbValue(u.__orm.data) ?? null;
          });
        this.rowsOfTable(todo.metadata.tableName)[id] = row;
      });
      todo.deletes.forEach((d) => {
        this.onQuery();
        const id = deTagId(todo.metadata, d.idOrFail);
        delete this.rowsOfTable(todo.metadata.tableName)[id];
        d.__orm.deleted = "deleted";
      });
    });
  }

  async flushJoinTables(em: EntityManager, joinRows: Record<string, JoinRowTodo>): Promise<void> {
    for (const [joinTableName, { m2m, newRows, deletedRows }] of Object.entries(joinRows)) {
      newRows.forEach((row) => {
        const { id, created_at, m2m, ...fkColumns } = row;
        // The rows in EntityManager.joinRows point to entities, change those to integers
        Object.keys(fkColumns).forEach((key) => {
          const meta = key == m2m.columnName ? getMetadata(m2m.entity) : m2m.otherMeta;
          fkColumns[key] = keyToNumber(meta, maybeResolveReferenceToId(fkColumns[key]));
        });
        this.onQuery();
        this.insert(joinTableName, fkColumns);
        row.id = fkColumns.id as number;
      });

      // `remove`s that were done against unloaded ManyToManyCollections will not have row ids
      const [haveIds, noIds] = partition(deletedRows, (r) => r.id !== -1);

      haveIds.forEach((row) => {
        this.onQuery();
        this.delete(joinTableName, row.id!);
      });

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
          .forEach((found) => {
            this.onQuery();
            this.delete(joinTableName, found.id);
          });
      });
    }
  }

  async load<T extends Entity>(
    em: EntityManager,
    meta: EntityMetadata<T>,
    untaggedIds: readonly string[],
  ): Promise<unknown[]> {
    this.onQuery();
    const rows = Object.values(this.data[meta.tableName] || {});
    return rows.filter((row) => untaggedIds.includes(String(row["id"])));
  }

  async loadManyToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: ManyToManyCollection<T, U>,
    keys: readonly string[],
  ): Promise<JoinRow[]> {
    this.onQuery();
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

  async findManyToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: ManyToManyCollection<T, U>,
    keys: readonly string[],
  ): Promise<JoinRow[]> {
    this.onQuery();
    const rows = Object.values(this.rowsOfTable(collection.joinTableName));
    const set = new Set(keys);
    const [column1, column2] = [collection.columnName, collection.otherColumnName];
    const [m1, m2] = [collection.meta, collection.otherMeta];
    return rows.filter((row) => {
      const key1 = `${column1}=${tagId(m1, row[column1])},${column2}=${tagId(m2, row[column2])}`;
      const key2 = `${column2}=${tagId(m2, row[column2])},${column1}=${tagId(m1, row[column1])}`;
      return set.has(key1) || set.has(key2);
    });
  }

  async loadOneToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: OneToManyCollection<T, U>,
    untaggedIds: readonly string[],
  ): Promise<unknown[]> {
    this.onQuery();
    const rows = Object.values(this.rowsOfTable(collection.otherMeta.tableName));
    return rows.filter((row) => untaggedIds.includes(String(row[collection.otherColumnName])));
  }

  async findOneToMany<T extends Entity, U extends Entity>(
    em: EntityManager,
    collection: OneToManyCollection<T, U>,
    keys: readonly string[],
  ): Promise<JoinRow[]> {
    this.onQuery();
    // If we're loading author.books, we need to look in the books table
    const rows = Object.values(this.rowsOfTable(collection.otherMeta.tableName));
    const set = new Set(keys);
    return rows.filter((row) => {
      const col1 = `id=${tagId(collection.otherMeta, row.id)}`;
      const col2 = `${collection.otherColumnName}=${tagId(collection.meta, row[collection.otherColumnName])}`;
      return set.has(`${col1},${col2}`);
    });
  }

  async loadOneToOne<T extends Entity, U extends Entity>(
    em: EntityManager,
    reference: OneToOneReferenceImpl<T, U>,
    untaggedIds: readonly string[],
  ): Promise<unknown[]> {
    this.onQuery();
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
  return Object.entries(where as any)
    .filter(([_, value]) => value !== undefined)
    .every(([fieldName, value]) => {
      const field = meta.fields[fieldName] || fail();
      // TODO Add column data to the fields
      const column = meta.fields[field.fieldName] || fail();
      // TODO Support multiple columns i.e. polymorphic references
      const currentValue = (column.serde && row[column.serde.columns[0].columnName]) ?? null;
      switch (field.kind) {
        case "primaryKey":
        case "primitive":
        case "enum":
          let fn = (a: any) => a;
          if (field.kind === "enum") {
            fn = (v) => (field.enumDetailType as any).getByCode(v).id;
          } else if (field.kind === "primaryKey") {
            fn = (v) => keyToNumber(meta, v as any);
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

function sort(driver: InMemoryDriver, meta: EntityMetadata<any>, orderBy: object, a: any, b: any): number {
  const fieldName = Object.keys(orderBy)[0];
  const value = (orderBy as any)[fieldName];
  if (value !== "ASC" && value !== "DESC") {
    // I.e. value is something like `{ book: { author: { ... } }`
    const field = meta.fields[fieldName] || fail();
    if (field.kind === "m2o") {
      const newMeta = field.otherMetadata();
      const newA = driver.rowsOfTable(newMeta.tableName)[a.id];
      const newB = driver.rowsOfTable(newMeta.tableName)[b.id];
      return sort(driver, newMeta, value, newA, newB);
    } else {
      throw new Error(`Unsupported order by field ${fieldName}`);
    }
  }
  const flip = value === "DESC" ? -1 : 1;
  const column = meta.fields[fieldName] || fail();
  const key = column.serde!.columns[0].columnName;
  // TODO Handle sorting by more than just strings
  return a[key].localeCompare(b[key]) * flip;
}

function ensureUnderLimit(rows: unknown[]): unknown[] {
  if (rows.length >= entityLimit) {
    throw new Error(`Query returned more than ${entityLimit} rows`);
  }
  return rows;
}
