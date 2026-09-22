import type { Expr } from "src/queries/sql/Expr.ts";
import type { PrimitiveColumn, TableSourceBrand, TableSourceMgmt, tableMgmt } from "src/queries/sql/Tables.ts";
import { Column, type ColumnDescriptors } from "src/serde/columns.ts";
import { BigIntSerde, DateSerde, JsonSerde, PrimitiveSerde, type ScalarCodec } from "src/serde/serde.ts";

const customTableDefinition = Symbol("customTableDefinition");

/** Built-in storage types supported by concise custom-table declarations. */
export type CustomColumnType =
  | "boolean"
  | "int"
  | "float"
  | "bigint"
  | "text"
  | "uuid"
  | "date"
  | "timestamp"
  | "timestamptz"
  | "json"
  | "jsonb";

type CustomArrayType = "boolean" | "int" | "float" | "bigint" | "text" | "uuid";

/** Expanded custom-column declaration for physical names, SQL nullability, defaults, and generated storage. */
export type CustomColumnConfig =
  | {
      type: CustomColumnType;
      columnName?: string;
      nullable?: boolean;
      hasDefault?: boolean;
      generated?: boolean;
      array?: false;
    }
  | {
      type: CustomArrayType;
      columnName?: string;
      nullable?: boolean;
      hasDefault?: boolean;
      generated?: boolean;
      array: true;
    };

export type CustomColumnInput = CustomColumnType | CustomColumnConfig;
export type CustomColumnInputs = Readonly<Record<string, CustomColumnInput>>;

/** A reusable declaration created by `customTable`; call `table(definition)` to create a query handle. */
export interface CustomTableDefinition<TableName extends string, C extends CustomColumnInputs> {
  readonly [customTableDefinition]: CustomTableDefinitionBrand<TableName, C>;
}

/** A custom physical table with declared primitive columns but no entity or relationship metadata. */
export type CustomTable<C extends CustomColumnInputs, Name extends string = string> = {
  readonly [tableMgmt]: CustomTableBrand<C, Name>;
} & {
  readonly [K in keyof C]: PrimitiveColumn<CustomColumnValue<C[K]>, CustomColumnNull<C[K]>, Name>;
} & ("column" extends keyof C
    ? {}
    : {
        /** References a one-off physical column not included in the custom-table declaration. */
        column<R = unknown>(column: string): Expr<R, Name>;
      });

/** A schema-erased custom-table handle for APIs that inspect table identity rather than declared columns. */
export type CustomTableFor = { readonly [tableMgmt]: CustomTableSourceBrand<string> };

/** Recovers a custom table handle's declaration for mutation input checking. */
export type CustomColumnsOf<T> = T extends { readonly [tableMgmt]: CustomTableBrand<infer C, string> } ? C : never;

/** The declared domain value, before SQL nullability is applied. */
export type CustomColumnValue<I> =
  CustomColumnBaseValue<CustomColumnTypeOf<I>> extends infer V ? (CustomColumnArray<I> extends true ? V[] : V) : never;

/** Runtime custom-table identity and its normalized physical columns. */
export interface CustomTableMgmt extends TableSourceMgmt {
  columns: ColumnDescriptors;
}

/** Declares a physical table that Joist codegen intentionally does not model as an entity. */
export function customTable<const TableName extends string, const C extends CustomColumnInputs>(
  tableName: TableName,
  columns: C,
): CustomTableDefinition<TableName, C> {
  const descriptors = Object.fromEntries(
    Object.entries(columns).map(([fieldName, input]) => [fieldName, customColumn(fieldName, input)]),
  );
  return { [customTableDefinition]: { tableName, columns: descriptors } } as CustomTableDefinition<TableName, C>;
}

/** Recognizes a declaration created by `customTable`. */
export function isCustomTableDefinition(value: unknown): value is CustomTableDefinition<string, CustomColumnInputs> {
  return typeof value === "object" && value !== null && customTableDefinition in value;
}

/** Returns the normalized table name and columns stored in a custom-table declaration. */
export function getCustomTableDefinition<TableName extends string, C extends CustomColumnInputs>(
  definition: CustomTableDefinition<TableName, C>,
): CustomTableDefinitionBrand<TableName, C> {
  return definition[customTableDefinition];
}

interface CustomTableDefinitionBrand<TableName extends string, C extends CustomColumnInputs> {
  readonly tableName: TableName;
  readonly __columns: C;
  readonly columns: ColumnDescriptors;
}

interface CustomTableSourceBrand<Name extends string> extends TableSourceBrand<Name>, CustomTableMgmt {
  readonly __custom: true;
}

interface CustomTableBrand<C extends CustomColumnInputs, Name extends string> extends CustomTableSourceBrand<Name> {
  readonly __columns: C;
}

type CustomColumnTypeOf<I> = I extends CustomColumnType ? I : I extends { type: infer T } ? T : never;
type CustomColumnArray<I> = I extends { array: true } ? true : false;
type CustomColumnNull<I> = I extends { nullable: true } ? null : never;
/** Maps a custom column's SQL storage type to its TypeScript scalar value. */
type CustomColumnBaseValue<T> = T extends "boolean"
  ? boolean
  : T extends "int" | "float"
    ? number
    : T extends "bigint"
      ? bigint
      : T extends "text" | "uuid"
        ? string
        : T extends "date" | "timestamp" | "timestamptz"
          ? Date
          : T extends "json" | "jsonb"
            ? unknown
            : never;

/** Normalizes one concise custom-table declaration into the column metadata shared by reads and writes. */
function customColumn(fieldName: string, input: CustomColumnInput): Column {
  const config = typeof input === "string" ? { type: input } : input;
  const { type, nullable = false, hasDefault = false, generated = false, array = false } = config;
  const columnName = config.columnName ?? toSnakeCase(fieldName);
  const codec = customColumnCodec(type, array);
  return new Column(columnName, nullable, hasDefault, generated, false, true, undefined, codec);
}

/** Selects existing scalar codecs so custom columns behave like generated primitive columns. */
function customColumnCodec(type: CustomColumnType, array: boolean): ScalarCodec {
  if (type === "bigint") return new BigIntSerde(array);
  if (type === "date" || type === "timestamp" || type === "timestamptz") return new DateSerde(type);
  if (type === "json" || type === "jsonb") {
    const codec = new JsonSerde();
    codec.dbType = type;
    return codec;
  }
  const dbType = type === "float" ? "double precision" : type;
  return new PrimitiveSerde(array ? `${dbType}[]` : dbType, array);
}

/** Applies Joist's conventional camelCase field to snake_case column mapping. */
function toSnakeCase(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase();
}
