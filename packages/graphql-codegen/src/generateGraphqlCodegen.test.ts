import { EntityDbMetadata, EnumMetadata } from "joist-codgen";
import { generateGraphqlCodegen } from "./generateGraphqlCodegen";

describe("generateGraphqlCodegen", () => {
  it("creates a json file", () => {
    const entities: EntityDbMetadata[] = [];
    const enums: EnumMetadata = {};
    const file = generateGraphqlCodegen(entities, enums);
    expect(file.contents.toString()).toMatchInlineSnapshot(`
      "const mappers = {};

      const enumValues = {};

      module.exports = { mappers, enumValues };
      "
    `);
  });
});
