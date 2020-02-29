import { Table } from "pg-structure";
import { code, Code, imp } from "ts-poet";
import { EntityManager } from "./symbols";

/** Creates the placeholder file for our per-entity custom business logic in. */
export function generateInitialEntityFile(table: Table, entityName: string): Code {
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
