import { Table } from "@homebound/pg-structure";
import { pascalCase } from "change-case";
import isPlainObject from "is-plain-object";
import pluralize from "pluralize";
import { Config } from "./config";
import { DatabaseColumnType, PrimitiveTypescriptType } from "./EntityDbMetadata";

export function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}

export function isEntityTable(t: Table): boolean {
  const columnNames = t.columns.map((c) => c.name);
  return includesAllOf(columnNames, ["id", "created_at", "updated_at"]);
}

export function isEnumTable(t: Table): boolean {
  const columnNames = t.columns.map((c) => c.name);
  return includesAllOf(columnNames, ["id", "code", "name"]) && !isEntityTable(t);
}

export function isJoinTable(t: Table): boolean {
  const { columns } = t;
  const hasOnePk = columns.filter((c) => c.isPrimaryKey).length === 1;
  const hasTwoFks = columns.filter((c) => c.isForeignKey).length === 2;
  const hasThreeColumns = columns.length === 3;
  const hasFourColumnsOneIsCreatedAt =
    columns.length === 4 && columns.filter((c) => c.name === "created_at").length === 1;
  return hasOnePk && hasTwoFks && (hasThreeColumns || hasFourColumnsOneIsCreatedAt);
}

function includesAllOf(set: string[], subset: string[]): boolean {
  return subset.find((e) => !set.includes(e)) === undefined;
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

/** Maps db types, i.e. `int`, to JS types, i.e. `number`. */
export function mapSimpleDbTypeToTypescriptType(dbType: DatabaseColumnType): PrimitiveTypescriptType {
  switch (dbType) {
    case "boolean":
      return "boolean";
    case "int":
    case "numeric":
      return "number";
    case "text":
    case "citext":
    case "character varying":
    case "varchar":
      return "string";
    case "timestamp with time zone":
    case "date":
      return "Date";
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
    .reduce((acc, key) => {
      const value = o[key as keyof T];
      const newValue = typeof value === "object" && isPlainObject(value) ? sortKeys((value as any) as object) : value;
      acc[key as keyof T] = newValue as any;
      return acc;
    }, ({} as any) as T);
}
