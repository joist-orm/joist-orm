import { Table } from "pg-structure";
import pluralize from "pluralize";
import { pascalCase } from "change-case";

export function isEntityTable(t: Table): boolean {
  const columnNames = t.columns.map(c => c.name);
  return includesAllOf(columnNames, ["id", "created_at", "updated_at"]);
}

export function isEnumTable(t: Table): boolean {
  const columnNames = t.columns.map(c => c.name);
  return includesAllOf(columnNames, ["id", "code", "name"]) && !isEntityTable(t);
}

export function isJoinTable(t: Table): boolean {
  const { columns } = t;
  const hasOnePk = columns.filter(c => c.isPrimaryKey).length === 1;
  const hasTwoFks = columns.filter(c => c.isForeignKey).length === 2;
  const hasThreeColumns = columns.length === 3;
  const hasFourColumnsOneIsCreatedAt =
    columns.length === 4 && columns.filter(c => c.name === "created_at").length === 1;
  return hasOnePk && hasTwoFks && (hasThreeColumns || hasFourColumnsOneIsCreatedAt);
}

function includesAllOf(set: string[], subset: string[]): boolean {
  return subset.find(e => !set.includes(e)) === undefined;
}

/** Converts `projects` to `Project`. */
export function tableToEntityName(table: Table): string {
  return pascalCase(pluralize.singular(table.name));
}

/** Maps db types, i.e. `int`, to JS types, i.e. `number`. */
export function mapSimpleDbType(dbType: string): string {
  switch (dbType) {
    case "bool":
      return "boolean";
    case "int":
      return "number";
    case "text":
    case "varchar":
      return "string";
    case "timestamptz":
    case "date":
      return "Date";
    default:
      throw new Error(`Unrecognized type ${dbType}`);
  }
}

export function merge<T>(a: T[], b: T[]): T[] {
  return [...a, ...b];
}

/** Returns true if `p` is resolved, otherwise false if it is rejected. */
export async function trueIfResolved(p: Promise<unknown>): Promise<boolean> {
  return await p.then(
    () => true,
    () => false,
  );
}

export function fail(message?: string): never {
  throw new Error(message || "Failed");
}
