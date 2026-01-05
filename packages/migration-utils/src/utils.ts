import {
  ColumnDefinition,
  ColumnDefinitions,
  DropOptions,
  MigrationBuilder,
  PgLiteral,
  TableOptions,
} from "node-pg-migrate";
import { singular } from "pluralize";

/**
 * Creates an entity table with our conventions.
 *
 * Specifically an `id` auto-increment column (via a sequence) and `created_at` and `updated_at`
 * columns.
 */
export function createEntityTable(b: MigrationBuilder, tableName: string, columns: ColumnDefinitions): void {
  b.createTable(tableName, {
    id: "id",
    ...columns,
    created_at: { type: "timestamptz", notNull: true },
    updated_at: { type: "timestamptz", notNull: true },
  });

  // Postgres doesn't automatically index foreign keys, so any column def points at
  // another table, assume we'll be doing a lot of lookups on this column and should fk it.
  Object.entries(columns).forEach(([name, def]) => {
    if (typeof def === "object" && def.references) {
      b.addIndex(tableName, [name], { method: "btree" });
    }
  });

  createTriggers(b, tableName);
}

/**
 * Creates a subtype table using class-per-table inheritance.
 *
 * The subtable will use the base table's id as its identity, and when loading rows of the base
 * type, Joist will automatically stitch together rows across each table into a single instance.
 */
export function createSubTable(
  b: MigrationBuilder,
  baseTableName: string,
  subTableName: string,
  columns: ColumnDefinitions,
): void {
  b.createTable(subTableName, {
    id: {
      type: "int",
      references: `${baseTableName}`,
      primaryKey: true,
      deferrable: true,
      deferred: true,
      onDelete: "CASCADE",
    },
    ...columns,
  });
  // Postgres doesn't automatically index foreign keys, so any column def points at
  // another table, assume we'll be doing a lot of lookups on this column and should fk it.
  Object.entries(columns).forEach(([name, def]) => {
    if (typeof def === "object" && def.references) {
      b.addIndex(subTableName, [name], { method: "btree" });
    }
  });
}

export function createEnumTable(b: MigrationBuilder, tableName: string, values: Array<[string, string]>): void {
  b.createTable(tableName, {
    id: "id",
    code: { type: "text", notNull: true },
    name: { type: "text", notNull: true },
  });
  b.addConstraint(tableName, `${tableName}_unique_enum_code_constraint`, "UNIQUE (code)");
  values.forEach((value) => addEnumValue(b, tableName, value));
}
export function addEnumValue(b: MigrationBuilder, tableName: string, value: [string, string]): void {
  const [code, name] = value;
  validateEnumCode(code);
  b.sql(`INSERT INTO ${tableName} (code, name) VALUES ('${code}', '${name.replace("'", "''")}');`);
}

export function updateEnumValue(
  b: MigrationBuilder,
  tableName: string,
  previousCode: string,
  value: [string, string],
): void {
  const [code, name] = value;
  validateEnumCode(code);
  b.sql(`UPDATE ${tableName} SET code ='${code}', name = '${name.replace("'", "''")}' WHERE code = '${previousCode}';`);
}

function validateEnumCode(code: string): void {
  const codeRegex = /^[A-Z0-9_]+$/;
  if (!codeRegex.test(code))
    throw `ERROR: Invalid enum code specified: ${code}. Codes must match the regex: ${codeRegex}`;
}

/** Makes a trigger to update the `updated_at` column. */
export function createTriggers(b: MigrationBuilder, tableName: string): void {
  b.createTrigger(tableName, `${tableName}_created_at`, {
    when: "BEFORE",
    operation: "INSERT",
    level: "ROW",
    function: "trigger_maybe_set_created_at",
  });
  b.createTrigger(tableName, `${tableName}_updated_at`, {
    when: "BEFORE",
    operation: "UPDATE",
    level: "ROW",
    function: "trigger_maybe_set_updated_at",
  });
}

export function createUpdatedAtFunction(b: MigrationBuilder): void {
  b.createFunction(
    "trigger_maybe_set_updated_at",
    [],
    { replace: true, language: "plpgsql", returns: "TRIGGER" },
    "BEGIN IF NEW.updated_at = OLD.updated_at THEN NEW.updated_at = NOW(); END IF; RETURN NEW; END;",
  );
}

export function createCreatedAtFunction(b: MigrationBuilder): void {
  b.createFunction(
    "trigger_maybe_set_created_at",
    [],
    { replace: true, language: "plpgsql", returns: "TRIGGER" },
    "BEGIN IF NEW.created_at IS NULL THEN NEW.created_at = NOW(); END IF; IF NEW.updated_at IS NULL THEN NEW.updated_at = NOW(); END IF; RETURN NEW; END;",
  );
}

export type FieldNameOverrides = {
  fieldName?: string;
  otherFieldName?: string;
};
type ForeignKeyOpts = Partial<ColumnDefinition> & Required<Pick<ColumnDefinition, "notNull">> & FieldNameOverrides;
export function foreignKey(otherTable: string, opts: ForeignKeyOpts): ColumnDefinition {
  return {
    type: "integer",
    references: otherTable,
    deferrable: true,
    deferred: true,
    ...foreignKeyOptsWithMaybeComment(opts),
  };
}

export type RenameRelationOpts = FieldNameOverrides & Pick<ColumnDefinition, "comment">;
export function renameRelation(b: MigrationBuilder, tableName: string, columnName: string, opts: RenameRelationOpts) {
  b.alterColumn(tableName, columnName, foreignKeyOptsWithMaybeComment(opts));
}

export function commentData(data: any, comment?: string | null): string {
  return `${comment ?? ""}[pg-structure]${JSON.stringify(data)}[/pg-structure]`;
}

function foreignKeyOptsWithMaybeComment<T extends RenameRelationOpts, R extends Omit<T, keyof FieldNameOverrides>>(
  opts: T,
): R {
  let { comment, fieldName, otherFieldName, ...rest } = opts;
  if (fieldName || otherFieldName) {
    const overrides = { fieldName, otherFieldName };
    return { ...(rest as R), comment: commentData(overrides, comment) };
  } else if (comment) {
    return { ...(rest as R), comment };
  } else {
    return rest as R;
  }
}

export function enumArrayColumn(enumTable: string, opts?: Pick<ColumnDefinition, "notNull">): ColumnDefinition {
  // We use `notNull: false` to facilitate adding to tables with existing rows,
  // but note that we coalesce null to `[]` anyway in the serde logic, so it
  // doesn't really matter to application logic whether it's notNull or not.
  return {
    type: "integer[]",
    comment: `enum=${enumTable}`,
    notNull: false,
    default: PgLiteral.create("array[]::integer[]"),
    ...opts,
  };
}

type ManyToManyColumn = {
  /** The target table for this m2m table, i.e. for a `books_to_tags`, this might be `books`. */
  table: string;
  /** The column name within the m2m table, i.e. for a `books_to_tags`, this might be `book_id`. */
  column?: string;
  /**
   * The name of the collection that *points to* these rows, i.e. for `books_to_tags` and the `book_id`
   * column, `collectionName=taggedBooks` b/c `t1.taggedBooks` does a `SELECT book_id WHERE tag_id=t:1`.
   *
   * For self-referential m2m tables, i.e. `author_to_mentors`, these names can be confusing, i.e.:
   *
   * ```
   * createManyToManyTable(
   *   b,
   *   "author_to_mentors",
   *   // column=mentor_id, collectionName=mentors ==> `a.mentors` does `select mentor_id WHERE mentee_id=a:1`
   *   { table: "authors", column: "mentor_id", collectionName: "mentors" },
   *   // column=mentee_id, collectionName=mentees ==> `a.mentees` does `select mentee_id WHERE mentor_id=a:1`
   *   { table: "authors", column: "mentee_id", collectionName: "mentees" },
   * );
   * ````
   */
  collectionName?: string;
};

function maybeTableOrColumn(maybeTableOrColumn: string | ManyToManyColumn): [string, string, string | undefined] {
  if (typeof maybeTableOrColumn === "string") {
    return [maybeTableOrColumn, `${singular(maybeTableOrColumn)}_id`, undefined];
  } else {
    const { table, column, collectionName } = maybeTableOrColumn;
    return [table, column ?? `${singular(table)}_id`, collectionName];
  }
}

/** Creates a many-to-many table between `table1` and `table2` with our conventions. */
export function createManyToManyTable(
  b: MigrationBuilder,
  tableName: string,
  table1: string,
  table2: string,
  options?: TableOptions & DropOptions,
): void;
export function createManyToManyTable(
  b: MigrationBuilder,
  tableName: string,
  column1: ManyToManyColumn,
  column2: ManyToManyColumn,
  options?: TableOptions & DropOptions,
): void;
export function createManyToManyTable(
  b: MigrationBuilder,
  tableName: string,
  table1: string,
  column2: ManyToManyColumn,
  options?: TableOptions & DropOptions,
): void;
export function createManyToManyTable(
  b: MigrationBuilder,
  tableName: string,
  column1: ManyToManyColumn,
  table2: string,
  options?: TableOptions & DropOptions,
): void;
export function createManyToManyTable(
  b: MigrationBuilder,
  tableName: string,
  tableOrColumn1: string | ManyToManyColumn,
  tableOrColumn2: string | ManyToManyColumn,
  options?: TableOptions & DropOptions,
) {
  const [table1, column1, otherFieldName1] = maybeTableOrColumn(tableOrColumn1);
  const [table2, column2, otherFieldName2] = maybeTableOrColumn(tableOrColumn2);
  b.createTable(
    tableName,
    {
      id: "id",
      [column1]: foreignKey(table1, { notNull: true, onDelete: "CASCADE", otherFieldName: otherFieldName1 }),
      [column2]: foreignKey(table2, { notNull: true, onDelete: "CASCADE", otherFieldName: otherFieldName2 }),
      created_at: { type: "timestamptz", notNull: true, default: b.func("NOW()") },
    },
    options,
  );
  b.createIndex(tableName, [column1, column2], { unique: true, ifNotExists: options?.ifNotExists });
  b.createIndex(tableName, [column2]); // Improves lookup performance when querying just column2
}

/** Adds columns + auto-indexes any foreign keys. */
export function addColumns(b: MigrationBuilder, tableName: string, columns: ColumnDefinitions): void {
  b.addColumns(tableName, columns);
  Object.entries(columns).forEach(([name, def]) => {
    if (typeof def === "object" && def.references) {
      b.addIndex(tableName, [name], { method: "btree" });
    }
  });
}

export function fail(message?: string): never {
  throw new Error(message || "Failed");
}
