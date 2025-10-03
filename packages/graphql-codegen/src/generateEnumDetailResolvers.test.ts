import { Config } from "joist-codegen";
import { generateEnumDetailResolvers } from "./generateEnumDetailResolvers";
import { renderCodegenFile } from "./testUtils";

describe("generateEnumDetailResolvers", () => {
  it.each([
    {
      desc: "no extensions for non-ESM",
      config: { esm: false } as Config,
      snapshot: `
     "import type { Resolvers } from "src/generated/graphql-types";

     type EnumDetails = never;

     export const enumResolvers: Pick<Resolvers, EnumDetails> = {};
     "
    `,
    },
    {
      desc: ".js extensions for ESM",
      config: { esm: true, allowImportingTsExtensions: false } as Config,
      snapshot: `
     "import type { Resolvers } from "src/generated/graphql-types.js";

     type EnumDetails = never;

     export const enumResolvers: Pick<Resolvers, EnumDetails> = {};
     "
    `,
    },
    {
      desc: ".ts extensions for ESM with allowImportingTsExtensions",
      config: { esm: true, allowImportingTsExtensions: true } as Config,
      snapshot: `
     "import type { Resolvers } from "src/generated/graphql-types.ts";

     type EnumDetails = never;

     export const enumResolvers: Pick<Resolvers, EnumDetails> = {};
     "
    `,
    },
  ])("generates file with $desc", async ({ config, snapshot }) => {
    const file = await generateEnumDetailResolvers(config, {});
    expect(renderCodegenFile(file, config)).toMatchInlineSnapshot(snapshot);
  });
});
