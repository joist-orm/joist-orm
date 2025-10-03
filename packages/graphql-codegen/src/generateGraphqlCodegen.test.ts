import { Config, EntityDbMetadata, EnumMetadata } from "joist-codegen";
import { Code } from "ts-poet";
import { generateGraphqlCodegen } from "./generateGraphqlCodegen";

describe("generateGraphqlCodegen", () => {
  it("creates a cjs file by default", async () => {
    const entities: EntityDbMetadata[] = [];
    const enums: EnumMetadata = {};
    const file = generateGraphqlCodegen({} as Config, entities, enums);
    expect((file.contents as Code).toString()).toMatchInlineSnapshot(`
      "const mappers = {};

      const enumValues = {};

      module.exports = { mappers, enumValues };
      "
    `);
  });

  it("creates an mjs file when esm is true", async () => {
    const entities: EntityDbMetadata[] = [];
    const enums: EnumMetadata = {};
    const file = generateGraphqlCodegen({ esm: true } as Config, entities, enums);
    expect(file.name).toBe("../../graphql-codegen-joist.mjs");
    expect((file.contents as Code).toString()).toMatchInlineSnapshot(`
      "export const mappers = {};

      export const enumValues = {};
      "
    `);
  });
});
