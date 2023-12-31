import { pascalCase } from "change-case";
import { Client } from "pg";
import { Db, EnumType, Table } from "pg-structure";
import { Config, EntityDbMetadata, PrimitiveField } from "./index";
import { isEnumTable } from "./utils";

/** A map from Enum table name to the rows currently in the table. */
export type EnumTableData = {
  table: Table;
  idType: "integer" | "uuid";
  // Pascal case version of table name
  name: string;
  rows: EnumRow[];
  extraPrimitives: PrimitiveField[];
};

export type PgEnumData = {
  name: string;
  values: string[];
};

export type EnumMetadata = Record<string, EnumTableData>;
export type PgEnumMetadata = Record<string, PgEnumData>;

export type EnumRow = { id: number; code: string; name: string; [key: string]: any };

export async function loadEnumMetadata(db: Db, client: Client, config: Config): Promise<EnumMetadata> {
  const promises = db.tables
    .filter((t) => isEnumTable(config, t))
    .mapToArray(async (table) => {
      const result = await client.query(`SELECT * FROM ${table.name} ORDER BY id`);
      const rows = result.rows.map((row) => row as EnumRow);
      // We're not really an entity, but appropriate EntityDbMetadata's `primitives` filtering
      const extraPrimitives = new EntityDbMetadata(config, table).primitives.filter(
        (p) => !["code", "name"].includes(p.fieldName),
      );
      return [
        table.name,
        {
          table,
          idType: table.columns.get("id")!.type.name === "uuid" ? "uuid" : "integer",
          name: pascalCase(table.name), // use tableToEntityName?
          rows,
          extraPrimitives,
        },
      ] satisfies [string, EnumTableData];
    });
  return Object.fromEntries(await Promise.all(promises));
}

export async function loadPgEnumMetadata(db: Db, client: Client, config: Config): Promise<PgEnumMetadata> {
  return db.types.reduce((all, type) => {
    if (type instanceof EnumType) {
      return {
        ...all,
        [type.name]: {
          name: pascalCase(type.name),
          values: type.values,
        },
      };
    }
    return all;
  }, {});
}
