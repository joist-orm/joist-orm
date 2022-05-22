import { EntityDbMetadata, EnumMetadata } from "joist-codegen";
import { Code } from "ts-poet";
import { generateGraphqlCodegen } from "./generateGraphqlCodegen";

describe("generateGraphqlCodegen", () => {
  it("creates a json file", async () => {
    const entities: EntityDbMetadata[] = [];
    const enums: EnumMetadata = {};
    const file = generateGraphqlCodegen(entities, enums);
    expect(await (file.contents as Code).toStringWithImports()).toMatchInlineSnapshot(`
      "const mappers = {};

      const enumValues = {};

      module.exports = { mappers, enumValues };
      "
    `);
  });
});
