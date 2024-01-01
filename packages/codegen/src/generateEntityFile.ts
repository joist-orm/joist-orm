import { code, Code, imp } from "ts-poet";
import { EntityDbMetadata } from "./EntityDbMetadata";

/** Creates the placeholder file for our per-entity custom business logic in. */
export function generateEntityFile(meta: EntityDbMetadata): Code {
  const entityName = meta.entity.name;
  const codegenClass = imp(`${entityName}Codegen@./entities`);
  return code`
    import { ${meta.entity.configConst.symbol} as config } from "./entities";

    export class ${entityName} extends ${codegenClass} {}

    // remove once you have actual rules/hooks
    config.placeholder();
  `;
}
