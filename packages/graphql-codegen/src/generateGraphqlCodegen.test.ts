import { EntityDbMetadata, EnumMetadata } from "joist-codegen";
import { Code } from "ts-poet";
import { generateGraphqlCodegen } from "./generateGraphqlCodegen";

describe("generateGraphqlCodegen", () => {
  it("creates a json file", async () => {
    const entities: EntityDbMetadata[] = [];
    const enums: EnumMetadata = {};
    const file = generateGraphqlCodegen(entities, enums);
    expect((file.contents as Code).toString()).toMatchInlineSnapshot(`
      "const mappers = {};

      const enumValues = {};

      module.exports = { mappers, enumValues };
      "
    `);
  });
});
