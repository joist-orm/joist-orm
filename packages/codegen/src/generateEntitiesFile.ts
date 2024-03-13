import { PgEnumData } from "index";
import { Table } from "pg-structure";
import { code, Code } from "ts-poet";
import { Config } from "./config";
import { EntityDbMetadata } from "./EntityDbMetadata";
import { tableToEntityName } from "./utils";

export function generateEntitiesFile(
  config: Config,
  entities: EntityDbMetadata[],
  enums: Table[],
  pgEnums: PgEnumData[],
): Code {
  // Output base types before subtypes, so that `class SmallPublisherCodegen extends Publisher` can
  // immediately resolve the `Publisher` symbol. Assume only 1 level of inheritance for now.
  const baseClasses = entities.filter((e) => e.baseClassName === undefined);
  const subClasses = entities.filter((e) => e.baseClassName !== undefined);
  return code`
    // organize-imports-ignore

    // This file drives our import order to avoid undefined errors
    // when the subclasses extend the base classes, see:
    // https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de
    ${enums.map((table) => {
      return `export * from "./enums/${tableToEntityName(config, table)}";`;
    })}
    ${pgEnums.map((meta) => {
      return `export * from "./enums/${meta.name}";`;
    })}
    ${baseClasses.map((meta) => {
      return `export * from "./codegen/${meta.entity.name}Codegen";`;
    })}
    ${baseClasses.map((meta) => {
      return `export * from "./${meta.entity.name}";`;
    })}
    ${subClasses.map((meta) => {
      return `export * from "./codegen/${meta.entity.name}Codegen";`;
    })}
    ${subClasses.map((meta) => {
      return `export * from "./${meta.entity.name}";`;
    })}
    export * from "./factories";
    export * from "./codegen/metadata";
  `;
}
