import { code, Code, imp } from "ts-poet";
import { EntityManager } from "./symbols";
import { EntityDbMetadata } from "./EntityDbMetadata";

/** Creates the placeholder file for our per-entity custom business logic in. */
export function generateInitialEntityFile(meta: EntityDbMetadata): Code {
  const entityName = meta.entity.name;
  const codegenClass = imp(`${entityName}Codegen@./entities`);
  const optsClass = imp(`${entityName}Opts@./entities`);
  return code`
    export class ${entityName} extends ${codegenClass} {
      constructor(em: ${EntityManager}, opts: ${optsClass}) {
        super(em, opts);
      }
    }
  `;
}
