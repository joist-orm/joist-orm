import { type Table } from "pg-structure";
import { type Code, code } from "ts-poet";

import { type Config } from "./config.ts";
import { type EntityDbMetadata } from "./EntityDbMetadata.ts";
import { type PgEnumData } from "./index.ts";
import { tableToEntityName } from "./utils.ts";

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

  const esmExt = config.esm ? (config.allowImportingTsExtensions ? ".ts" : ".js") : "";

  return code`
    // organize-imports-ignore

    // This file drives our import order to avoid undefined errors
    // when the subclasses extend the base classes, see:
    // https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de
    ${enums.map((table) => {
      return `export * from "./enums/${tableToEntityName(config, table)}${esmExt}";`;
    })}
    ${pgEnums.map((meta) => {
      return `export * from "./enums/${meta.name}${esmExt}";`;
    })}
    ${baseClasses.map((meta) => {
      return `export * from "./codegen/${meta.entity.name}Codegen${esmExt}";`;
    })}
    ${baseClasses.map((meta) => {
      return `export * from "./${meta.entity.name}${esmExt}";`;
    })}
    ${subClasses.map((meta) => {
      return `export * from "./codegen/${meta.entity.name}Codegen${esmExt}";`;
    })}
    ${subClasses.map((meta) => {
      return `export * from "./${meta.entity.name}${esmExt}";`;
    })}
    ${entities.map(({ entity }) => {
      return `export * from "./factories/new${entity.name}${esmExt}";`;
    })}
    export * from "./codegen/metadata${esmExt}";
  `;
}
