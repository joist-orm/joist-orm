import { code, Code, imp } from "ts-poet";
import { EntityDbMetadata } from "./EntityDbMetadata";

/** Creates the placeholder file for our per-entity custom business logic in. */
export function generateInitialEntityFile(meta: EntityDbMetadata): Code {
  const entityName = meta.entity.name;
  const codegenClass = imp(`${entityName}Codegen@./entities`);
  return code`
    export class ${entityName} extends ${codegenClass} {}
  `;
}
