import { camelCase } from "change-case";
import { PgEnumData } from "index";
import { Table } from "pg-structure";
import { code, Code, imp } from "ts-poet";
import { Config } from "./config";
import { EntityDbMetadata } from "./EntityDbMetadata";
import { tableToEntityName } from "./utils";

const joistScope = imp("scope@joist-orm");
const joistScopeFactory = imp("t:ScopeFactory@joist-orm");

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
    ${baseClasses.map((meta) => generateScopeHelperDeclaration(config, meta))}
    ${baseClasses.map((meta) => {
      return `export * from "./${meta.entity.name}${esmExt}";`;
    })}
    ${subClasses.map((meta) => {
      return `export * from "./codegen/${meta.entity.name}Codegen${esmExt}";`;
    })}
    ${subClasses.map((meta) => generateScopeHelperDeclaration(config, meta))}
    ${subClasses.map((meta) => {
      return `export * from "./${meta.entity.name}${esmExt}";`;
    })}
    ${entities.map(({ entity }) => {
      return `export * from "./factories/new${entity.name}${esmExt}";`;
    })}
    export * from "./codegen/metadata${esmExt}";
  `;
}

/** Creates the per-entity curried `scope` helper exported from `entities.ts`. */
function generateScopeHelperDeclaration(config: Config, meta: EntityDbMetadata): Code {
  const entityName = meta.entity.name;
  const entityPath = `./${entityName}${config.esm ? (config.allowImportingTsExtensions ? ".ts" : ".js") : ""}`;
  const scopeName = `${camelCase(entityName)}Scope`;
  const entityType = imp(`t:${entityName}@${entityPath}`);
  const argType = code`Parameters<${joistScopeFactory}<${entityType}>>[0]`;
  const returnType = code`ReturnType<${joistScopeFactory}<${entityType}>>`;

  return code`
    export function ${scopeName}(arg: ${argType}): ${returnType} {
      return ${joistScope}<${entityType}>("${entityName}")(arg);
    }
  `;
}
