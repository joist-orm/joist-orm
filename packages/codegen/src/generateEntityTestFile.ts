import { type Code, code } from "ts-poet";

import { type Config } from "./config.ts";
import { type EntityDbMetadata } from "./EntityDbMetadata.ts";

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
