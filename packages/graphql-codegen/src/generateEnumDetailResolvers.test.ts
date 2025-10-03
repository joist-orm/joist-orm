import { Config } from "joist-codegen";
import { generateEnumDetailResolvers } from "./generateEnumDetailResolvers";
import { renderCodegenFile } from "./testUtils";

describe("generateEnumDetailResolvers", () => {
  it.each([
    {
      desc: "no extensions for non-ESM",
      config: { esm: false } as Config,
      graphqlTypesImport: "src/generated/graphql-types",
    },
    {
      desc: ".js extensions for ESM",
      config: { esm: true, allowImportingTsExtensions: false } as Config,
      graphqlTypesImport: "src/generated/graphql-types.js",
    },
    {
      desc: ".ts extensions for ESM with allowImportingTsExtensions",
      config: { esm: true, allowImportingTsExtensions: true } as Config,
      graphqlTypesImport: "src/generated/graphql-types.ts",
    },
  ])("generates file with $desc", async ({ config, graphqlTypesImport }) => {
    const file = await generateEnumDetailResolvers(config, {});
    expect(renderCodegenFile(file, config)).toMatchInlineSnapshot(`
     "import type { Resolvers } from "${graphqlTypesImport}";

     type EnumDetails = never;

     export const enumResolvers: Pick<Resolvers, EnumDetails> = {};
     "
    `);
  });
});
