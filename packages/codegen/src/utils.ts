import { pascalCase } from "change-case";
import { isPlainObject } from "joist-utils";
import { Table } from "pg-structure";
import pluralize from "pluralize";
import { code, imp } from "ts-poet";
import { DatabaseColumnType, PrimitiveTypescriptType } from "./EntityDbMetadata";
import { Config, getTimestampConfig } from "./config";

export function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}

export function isEntityTable(config: Config, t: Table): boolean {
  if (isIgnored(config, t) || isJoinTable(config, t)) {
    return false;
  }

  // Depending on the config settings, we may/may not require the presence of timestamp
  // fields to determine whether a table is an entity.
  const columnNames = t.columns.map((c) => c.name);
  const { updatedAtConf, createdAtConf } = getTimestampConfig(config);
  const hasCreatedAt = createdAtConf.names.some((c) => columnNames.includes(c));
  const hasUpdatedAt = updatedAtConf.names.some((c) => columnNames.includes(c));

  // Entities always require an id column
  const hasIdColumn = columnNames.includes("id");
  if (!hasIdColumn) return false;

  // If we have no timestamp columns, but do have `name` and `code`, we're probably an enum.
  if (hasIdColumn && !hasCreatedAt && !hasUpdatedAt) {
    if (["name", "code"].every((c) => columnNames.includes(c))) {
      return false;
    }
  }

  // If the ID column is a FK then we're a subclass
  if (isSubClassTable(t)) return true;

  // Otherwise respect the created_at/updated_at required rules
  return hasIdColumn && (hasCreatedAt || !createdAtConf.required) && (hasUpdatedAt || !updatedAtConf.required);
}

export function isSubClassTable(t: Table): boolean {
  // Note that `.get("id")` will blow up if there is no id column
  return t.columns.get("id").foreignKeys.length === 1;
}

export function isEnumTable(config: Config, t: Table): boolean {
  if (isIgnored(config, t)) {
    return false;
  }
  const columnNames = t.columns.map((c) => c.name);
  return ["id", "code", "name"].every((c) => columnNames.includes(c)) && !isEntityTable(config, t);
}

// Oddly enough isJoinTable showed up as a hot spot, so cache its calculation.
const joinTables: Map<string, boolean> = new Map();

export function isJoinTable(config: Config, t: Table): boolean {
  if (isIgnored(config, t)) {
    return false;
  }
  return getOrElse(joinTables, t.name, () => {
    const { columns } = t;
    const hasOnePk = columns.filter((c) => c.isPrimaryKey).length === 1;
    const hasTwoFks = columns.filter((c) => c.isForeignKey).length === 2;
    const hasThreeColumns = columns.length === 3;
    const hasFourColumnsOneIsCreatedAt =
      columns.length === 4 && columns.filter((c) => c.name === "created_at").length === 1;
    return hasOnePk && hasTwoFks && (hasThreeColumns || hasFourColumnsOneIsCreatedAt);
  });
}

function getOrElse<K, V>(map: Map<K, V>, key: K, fn: () => V): V {
  let value = map.get(key);
  if (value === undefined) {
    value = fn();
    map.set(key, value);
  }
  return value;
}

/** Converts `projects` to `Project`. */
export function tableToEntityName(config: Config, table: Table): string {
  let entityName = config.__tableToEntityName?.[table.name];
  if (!entityName) {
    const configEntityName = Object.entries(config.entities)
      .filter(([, conf]) => conf.tableName === table.name)
      .map(([entityName]) => entityName)[0];
    entityName = configEntityName || pascalCase(pluralize.singular(table.name));
    (config.__tableToEntityName ??= {})[table.name] = entityName;
  }
  return entityName;
}

export const dateCode = code`Date`;
export const plainDateCode = code`${imp("Temporal@temporal-polyfill")}.PlainDate`;
export const plainTimeCode = code`${imp("Temporal@temporal-polyfill")}.PlainTime`;
export const plainDateTimeCode = code`${imp("Temporal@temporal-polyfill")}.PlainDateTime`;
export const zonedDateTimeCode = code`${imp("Temporal@temporal-polyfill")}.ZonedDateTime`;

/** Maps db types, i.e. `int`, to JS types, i.e. `number`. */
export function mapSimpleDbTypeToTypescriptType(config: Config, dbType: DatabaseColumnType): PrimitiveTypescriptType {
  switch (dbType) {
    case "boolean":
      return "boolean";
    case "int":
    case "numeric":
    case "smallint":
    case "integer":
    case "decimal":
    case "real":
    case "smallserial":
    case "serial":
    case "double precision":
      return "number";
    case "bigserial":
    case "bigint":
      return "bigint";
    case "text":
    case "citext":
    case "character varying":
    case "varchar":
    case "uuid":
    case "tsvector":
    case "tstzrange":
      return "string";
    case "time without time zone":
      return config.temporal
        ? plainTimeCode
        : fail("Joist doesn't support 'time without time zone' unless temporal is enabled");
    case "timestamp with time zone":
      return config.temporal ? zonedDateTimeCode : dateCode;
    case "timestamp without time zone":
      return config.temporal ? plainDateTimeCode : dateCode;
    case "date":
      return config.temporal ? plainDateCode : dateCode;
    case "jsonb":
      return "Object";
    case "bytea":
      return "Uint8Array";
    default:
      assertNever(dbType);
  }
}

export function merge<T>(a: T[], b: T[]): T[] {
  return [...a, ...b];
}

/** Returns true if `p` is resolved, otherwise false if it is rejected. */
export async function trueIfResolved(p: Promise<unknown>): Promise<boolean> {
  return p.then(
    () => true,
    () => false,
  );
}

export function fail(message?: string): never {
  throw new Error(message || "Failed");
}

export function sortKeys<T extends object>(o: T): T {
  return Object.keys(o)
    .sort()
    .reduce(
      (acc, key) => {
        const value = o[key as keyof T];
        const newValue = typeof value === "object" && isPlainObject(value) ? sortKeys(value as any as object) : value;
        acc[key as keyof T] = newValue as any;
        return acc;
      },
      {} as any as T,
    );
}

export function parseOrder(order: string | undefined): { field: string; direction: "ASC" | "DESC" } | undefined {
  if (!order) {
    return undefined;
  }
  const [field, direction = "ASC"] = order.split(" ");
  if (direction !== "ASC" && direction !== "DESC") {
    throw new Error(`Invalid direction: ${direction} (must be "ASC" or "DESC")`);
  }
  return { field, direction };
}

export function q(s: string | undefined): string {
  return s === undefined ? "undefined" : `"${s}"`;
}

export function uncapitalize(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function isIgnored(config: Config, t: Table): boolean {
  return (config.ignoredTables || ["migrations", "pgmigrations"]).includes(t.name) || !shouldIncludeSchema(config, t);
}

function shouldIncludeSchema(config: Config, t: Table): boolean {
  return config.schemas ? config.schemas.includes(t.schema.name) : t.schema.name === "public";
}
