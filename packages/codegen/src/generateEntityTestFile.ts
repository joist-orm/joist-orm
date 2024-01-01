import { code, Code } from "ts-poet";
import { EntityDbMetadata } from "./EntityDbMetadata";

/** Creates the placeholder file for our entity's test. */
export function generateEntityTestFile(meta: EntityDbMetadata): Code {
  const entityName = meta.entity.name;
  return code`
    import { new${entityName} } from "./entities";

    describe("${entityName}", () => {
      it("works", async () => {
        const em = newEntityManager();
        new${entityName}(em);
        await em.flush();
      });
    });
  `;
}
