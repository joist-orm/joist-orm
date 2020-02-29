import { Table } from "pg-structure";
import { code, Code } from "ts-poet";
import { tableToEntityName } from "./utils";

export function generateEntitiesFile(entities: Table[], enums: Table[]): Code {
  return code`
    // This file drives our import order to avoid undefined errors
    // when the subclasses extend the base classes, see:
    // https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de
    ${enums.map(table => {
      return `export * from "./${tableToEntityName(table)}";`;
    })}
    ${entities.map(table => {
      return `export * from "./${tableToEntityName(table)}Codegen";`;
    })}
    ${entities.map(table => {
      return `export * from "./${tableToEntityName(table)}";`;
    })}
    export * from "./metadata";
  `;
}
