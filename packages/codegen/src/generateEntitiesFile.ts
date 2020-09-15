import { Table } from "@homebound/pg-structure";
import { code, Code } from "ts-poet";
import { Config } from "./config";
import { EntityDbMetadata } from "./EntityDbMetadata";
import { tableToEntityName } from "./utils";

export function generateEntitiesFile(config: Config, entities: EntityDbMetadata[], enums: Table[]): Code {
  return code`
    // organize-imports-ignore

    // This file drives our import order to avoid undefined errors
    // when the subclasses extend the base classes, see:
    // https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de
    ${enums.map((table) => {
      return `export * from "./${tableToEntityName(config, table)}";`;
    })}
    ${entities.map((meta) => {
      return `export * from "./${meta.entity.name}Codegen";`;
    })}
    ${entities.map((meta) => {
      return `export * from "./${meta.entity.name}";`;
    })}
    export * from "./factories";
    export * from "./metadata";
  `;
}
