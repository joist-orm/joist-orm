import { Code, code } from "ts-poet";

import { Config } from "./config";
import { EntityDbMetadata } from "./EntityDbMetadata";

/** Creates the placeholder file for our entity's test. */
export function generateEntityTestFile(config: Config, meta: EntityDbMetadata): Code {
  const entityName = meta.entity.name;
  const esmExt = config.esm ? (config.allowImportingTsExtensions ? ".ts" : ".js") : "";
  return code`
    import { new${entityName} } from "./entities${esmExt}";

    describe("${entityName}", () => {
      it("works", async () => {
        const em = newEntityManager();
        new${entityName}(em);
        await em.flush();
      });
    });
  `;
}
