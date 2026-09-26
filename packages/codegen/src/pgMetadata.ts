import type { Client } from "pg";

/** The small part of PostgreSQL's catalog model used by Joist codegen. */
export class Items<T extends { name: string }> extends Array<T> {
  private byName?: Map<string, T>;

  /** Looks up a column by name without scanning the table on every call. */
  get(name: string): T {
    // Catalog rows are appended before codegen reads them. Build the index on first lookup
    // so derived arrays from filter/map can still be indexed without special handling.
    this.byName ??= new Map(this.map((item) => [item.name, item]));
    const item = this.byName.get(name);
    if (!item) throw new Error(`No item named ${name}`);
    return item;
  }

  /** Keep the name index current if more catalog rows arrive after a lookup. */
  push(...items: T[]): number {
    const length = super.push(...items);
    if (this.byName) for (const item of items) this.byName.set(item.name, item);
    return length;
  }
}

export type Action = "NO ACTION" | "RESTRICT" | "CASCADE" | "SET NULL" | "SET DEFAULT";
export type JSONData = string | number | boolean | null | JSONData[] | { [key: string]: JSONData };

export class EnumType {
  readonly shortName?: string;
  constructor(
    public name: string,
    public values: string[],
  ) {}
}

export class Column {
  readonly foreignKeys: ForeignKey[] = [];
  readonly uniqueIndexes: Index[] = [];
  isPrimaryKey = false;

  constructor(
    public name: string,
    public type: { name: string; shortName?: string } | EnumType,
    public notNull: boolean,
    public defaultValue: string | null,
    public isGenerated: boolean,
    public arrayDimension: number,
    public comment: string | null,
  ) {}

  get isForeignKey(): boolean {
    return this.foreignKeys.length > 0;
  }

  get default(): string | null {
    return this.defaultValue?.replace(/^('.*?')::.+$/, "$1") ?? null;
  }

  get commentData(): JSONData | undefined {
    const data = this.comment?.match(/\[pg-structure\]([\s\S]*?)\[\/pg-structure\]/)?.[1];
    return data ? (JSON.parse(data) as JSONData) : undefined;
  }
}

export class Index {
  constructor(
    public name: string,
    public columns: Column[],
    public isUnique: boolean,
    public isPartial: boolean,
  ) {}
}

export class ForeignKey {
  constructor(
    public name: string,
    public table: Table,
    public referencedTable: Table,
    public columns: Column[],
    public isDeferred: boolean,
    public isDeferrable: boolean,
    public onDelete: Action,
  ) {}
}

export class M2ORelation {
  readonly type = "m2o";

  constructor(public foreignKey: ForeignKey) {}

  get sourceTable(): Table {
    return this.foreignKey.table;
  }

  get targetTable(): Table {
    return this.foreignKey.referencedTable;
  }
}

export class O2MRelation {
  readonly type = "o2m";

  constructor(public foreignKey: ForeignKey) {}

  get sourceTable(): Table {
    return this.foreignKey.referencedTable;
  }

  get targetTable(): Table {
    return this.foreignKey.table;
  }
}

export class M2MRelation {
  readonly type = "m2m";

  constructor(
    public foreignKey: ForeignKey,
    public targetForeignKey: ForeignKey,
  ) {}

  get sourceTable(): Table {
    return this.foreignKey.referencedTable;
  }

  get targetTable(): Table {
    return this.targetForeignKey.referencedTable;
  }

  get joinTable(): Table {
    return this.foreignKey.table;
  }
}

export class Table {
  readonly columns = new Items<Column>();
  readonly indexes = new Items<Index>();
  readonly foreignKeys: ForeignKey[] = [];
  readonly foreignKeysToThis: ForeignKey[] = [];
  readonly uniqueConstraints: { columns: Column[]; index: Index }[] = [];
  primaryKey?: { columns: Column[] };

  constructor(
    public name: string,
    public schema: { name: string },
  ) {}

  get m2oRelations(): M2ORelation[] {
    return this.foreignKeys.map((fk) => new M2ORelation(fk));
  }

  get o2mRelations(): O2MRelation[] {
    return this.foreignKeysToThis.map((fk) => new O2MRelation(fk));
  }

  get m2mRelations(): M2MRelation[] {
    return this.foreignKeysToThis.flatMap((fk) =>
      fk.table.foreignKeys.filter((other) => other !== fk).map((other) => new M2MRelation(fk, other)),
    );
  }
}

export type Db = { tables: Items<Table>; types: EnumType[] };

/**
 * Reads only the PostgreSQL catalog data used by codegen.
 *
 * Load tables and columns before constraints so each foreign key can link the same Table and Column
 * objects used by entity fields. For example, books.author_id and authors.id are joined through
 * the foreign key, while a trigger calling cyanaudit in another schema is irrelevant to codegen.
 */
export async function loadPgMetadata(client: Client): Promise<Db> {
  const tables = new Items<Table>();
  const byOid = new Map<number, Table>();
  const columns = new Map<number, Map<number, Column>>();

  const tableRows = await client.query<{ oid: number; name: string; schema: string }>(`
    SELECT c.oid, c.relname AS name, n.nspname AS schema
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname <> 'information_schema'
      AND n.nspname NOT LIKE 'pg_%' AND NOT pg_is_other_temp_schema(n.oid)
    ORDER BY n.nspname, c.relname
  `);
  for (const row of tableRows.rows) {
    const table = new Table(row.name, { name: row.schema });
    tables.push(table);
    byOid.set(row.oid, table);
    columns.set(row.oid, new Map());
  }

  const enumRows = await client.query<{ oid: number; name: string; value: string }>(`
    SELECT t.oid, t.typname AS name, e.enumlabel AS value
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg_%'
    ORDER BY t.oid, e.enumsortorder
  `);
  const enums = new Map<number, EnumType>();
  for (const row of enumRows.rows) {
    if (!enums.has(row.oid)) enums.set(row.oid, new EnumType(row.name, []));
    enums.get(row.oid)!.values.push(row.value);
  }

  const columnRows = await client.query<{
    tableOid: number;
    position: number;
    name: string;
    typeOid: number;
    typeName: string;
    notNull: boolean;
    defaultValue: string | null;
    generated: string;
    arrayDimension: number;
    comment: string | null;
  }>(
    `
    SELECT a.attrelid AS "tableOid", a.attnum AS position, a.attname AS name,
      COALESCE(NULLIF(t.typelem, 0), t.oid) AS "typeOid",
      base.typname AS "typeName", a.attnotnull AS "notNull",
      pg_get_expr(d.adbin, d.adrelid) AS "defaultValue", a.attgenerated AS generated,
      a.attndims AS "arrayDimension", col_description(a.attrelid, a.attnum) AS comment
    FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
    JOIN pg_type base ON base.oid = COALESCE(NULLIF(t.typelem, 0), t.oid)
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = ANY($1::oid[]) AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attrelid, a.attnum
  `,
    [Array.from(byOid.keys())],
  );
  for (const row of columnRows.rows) {
    const type = enums.get(row.typeOid) ?? sqlType(row.typeName);
    const column = new Column(
      row.name,
      type,
      row.notNull,
      row.defaultValue,
      row.generated !== "",
      row.arrayDimension,
      row.comment,
    );
    byOid.get(row.tableOid)!.columns.push(column);
    columns.get(row.tableOid)!.set(row.position, column);
  }

  const indexRows = await client.query<{
    tableOid: number;
    indexOid: number;
    name: string;
    positions: number[];
    unique: boolean;
    partial: boolean;
  }>(
    `
    SELECT i.indrelid AS "tableOid", i.indexrelid AS "indexOid", c.relname AS name,
      i.indkey::int2[] AS positions, i.indisunique AS unique, i.indpred IS NOT NULL AS partial
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE i.indrelid = ANY($1::oid[])
  `,
    [Array.from(byOid.keys())],
  );
  const indexes = new Map<number, Index>();
  for (const row of indexRows.rows) {
    const table = byOid.get(row.tableOid)!;
    const index = new Index(
      row.name,
      row.positions.flatMap((pos) => columns.get(row.tableOid)!.get(pos) ?? []),
      row.unique,
      row.partial,
    );
    table.indexes.push(index);
    indexes.set(row.indexOid, index);
    if (row.unique) for (const column of index.columns) column.uniqueIndexes.push(index);
  }

  const constraintRows = await client.query<{
    tableOid: number;
    targetOid: number;
    indexOid: number;
    name: string;
    kind: string;
    positions: number[] | null;
    deferred: boolean;
    deferrable: boolean;
    onDelete: string;
  }>(
    `
    SELECT conrelid AS "tableOid", confrelid AS "targetOid", conindid AS "indexOid",
      conname AS name, contype AS kind, conkey AS positions,
      condeferred AS deferred, condeferrable AS deferrable, confdeltype AS "onDelete"
    FROM pg_constraint WHERE conrelid = ANY($1::oid[]) AND contype IN ('p', 'u', 'f')
    ORDER BY conrelid, conname
  `,
    [Array.from(byOid.keys())],
  );
  for (const row of constraintRows.rows) {
    const table = byOid.get(row.tableOid)!;
    const keys = (row.positions ?? []).map((pos) => columns.get(row.tableOid)!.get(pos)!);
    if (row.kind === "p") {
      table.primaryKey = { columns: keys };
      for (const column of keys) column.isPrimaryKey = true;
    } else if (row.kind === "u") {
      table.uniqueConstraints.push({ columns: keys, index: indexes.get(row.indexOid)! });
    } else {
      const target = byOid.get(row.targetOid);
      if (!target) continue;
      const fk = new ForeignKey(
        row.name,
        table,
        target,
        keys,
        row.deferred,
        row.deferrable,
        deleteAction(row.onDelete),
      );
      table.foreignKeys.push(fk);
      target.foreignKeysToThis.push(fk);
      for (const column of keys) column.foreignKeys.push(fk);
    }
  }

  return { tables, types: Array.from(enums.values()) };
}

/** Matches the type names codegen expects from PostgreSQL's builtin aliases. */
function sqlType(name: string): { name: string; shortName?: string } {
  switch (name) {
    case "int2":
      return { name: "smallint" };
    case "int4":
      return { name: "integer", shortName: "int" };
    case "int8":
      return { name: "bigint" };
    case "bool":
      return { name: "boolean" };
    case "float4":
      return { name: "real" };
    case "float8":
      return { name: "double precision" };
    case "varchar":
      return { name: "character varying" };
    case "timestamptz":
      return { name: "timestamp with time zone" };
    case "timestamp":
      return { name: "timestamp without time zone" };
    case "time":
      return { name: "time without time zone" };
    default:
      return { name };
  }
}

/** Decodes the pg_constraint foreign-key delete action. */
function deleteAction(code: string): Action {
  switch (code) {
    case "a":
      return "NO ACTION";
    case "r":
      return "RESTRICT";
    case "c":
      return "CASCADE";
    case "n":
      return "SET NULL";
    case "d":
      return "SET DEFAULT";
    default:
      throw new Error(`Unknown PostgreSQL delete action: ${code}`);
  }
}
