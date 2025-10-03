import { Config, DbMetadata, EntityDbMetadata } from "joist-codegen";
import { generateQueryResolvers } from "./generateQueryResolvers";
import { newDbMeta, newEntityMetadata, renderCodegenFile } from "./testUtils";

describe("generateQueryResolvers", () => {
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
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    const [resolver] = await generate(config, entities);
    expect(resolver.name).toBe("resolvers/author/authorQuery.ts");
    expect(renderCodegenFile(resolver, config)).toMatchInlineSnapshot(`
     "import type { QueryResolvers } from "${graphqlTypesImport}";

     export const author: Pick<QueryResolvers, "author"> = {
       async author(_, args, ctx) {
         return ctx.em.load(Author, args.id);
       },
     };
     "
    `);
  });
});

async function generate(config: Config, opt: EntityDbMetadata[] | Partial<DbMetadata>) {
  return generateQueryResolvers(config, newDbMeta(opt));
}
