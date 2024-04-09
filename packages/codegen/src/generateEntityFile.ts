import { code, Code, imp } from "ts-poet";
import { EntityDbMetadata } from "./EntityDbMetadata";
import {Config} from "./config";

/** Creates the placeholder file for our per-entity custom business logic in. */
export function generateEntityFile(config: Config, meta: EntityDbMetadata): Code {
  const entityName = meta.entity.name;
  const codegenClass = imp(`${entityName}Codegen@./entities`);
  const esmExt = config.esm ? '.js' : '';

  return code`
    import { ${meta.entity.configConst.symbol} as config } from "./entities${esmExt}";

    export class ${entityName} extends ${codegenClass} {}

    // remove once you have actual rules/hooks
    config.placeholder();
  `;
}
