import { code, Code } from "ts-poet";
import { EntityDbMetadata } from "./EntityDbMetadata";
import { Config } from "./config";

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
