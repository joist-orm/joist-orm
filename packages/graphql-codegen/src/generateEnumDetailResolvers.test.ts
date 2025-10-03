import { Config } from "joist-codegen";
import { generateEnumDetailResolvers } from "./generateEnumDetailResolvers";
import { toStringWithConfig } from "./testUtils";

describe("generateEnumDetailResolvers", () => {
  it("generates file with no extensions for non-ESM", async () => {
    const config: Partial<Config> = { esm: false };
    const file = await generateEnumDetailResolvers(config as Config, {});
    expect(toStringWithConfig(file, config as Config)).toMatchInlineSnapshot(`
      "import { Resolvers } from "src/generated/graphql-types";

      type EnumDetails = never;

      export const enumResolvers: Pick<Resolvers, EnumDetails> = {};
      "
    `);
  });

  it("generates file with .js extensions for ESM", async () => {
    const config: Partial<Config> = { esm: true, allowImportingTsExtensions: false };
    const file = await generateEnumDetailResolvers(config as Config, {});
    expect(toStringWithConfig(file, config as Config)).toMatchInlineSnapshot(`
      "import { Resolvers } from "src/generated/graphql-types.js";

      type EnumDetails = never;

      export const enumResolvers: Pick<Resolvers, EnumDetails> = {};
      "
    `);
  });

  it("generates file with .ts extensions for ESM with allowImportingTsExtensions", async () => {
    const config: Partial<Config> = { esm: true, allowImportingTsExtensions: true };
    const file = await generateEnumDetailResolvers(config as Config, {});
    expect(toStringWithConfig(file, config as Config)).toMatchInlineSnapshot(`
      "import { Resolvers } from "src/generated/graphql-types.ts";

      type EnumDetails = never;

      export const enumResolvers: Pick<Resolvers, EnumDetails> = {};
      "
    `);
  });
});
