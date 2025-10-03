import { Config, DbMetadata, EntityDbMetadata } from "joist-codegen";
import { generateSaveResolvers } from "./generateSaveResolvers";
import { newDbMeta, newEntityMetadata, renderCodegenFile } from "./testUtils";

describe("generateSaveResolvers", () => {
  it.each([
    {
      desc: "no extensions for non-ESM",
      config: { esm: false } as Config,
      entitiesImport: "src/entities",
      graphqlTypesImport: "src/generated/graphql-types",
      utilsImport: "src/resolvers/utils",
    },
    {
      desc: ".js extensions for ESM",
      config: { esm: true, allowImportingTsExtensions: false } as Config,
      entitiesImport: "src/entities/index.js",
      graphqlTypesImport: "src/generated/graphql-types.js",
      utilsImport: "src/resolvers/utils.js",
    },
    {
      desc: ".ts extensions for ESM with allowImportingTsExtensions",
      config: { esm: true, allowImportingTsExtensions: true } as Config,
      entitiesImport: "src/entities/index.ts",
      graphqlTypesImport: "src/generated/graphql-types.ts",
      utilsImport: "src/resolvers/utils.ts",
    },
  ])("generates file with $desc", async ({ config, entitiesImport, graphqlTypesImport, utilsImport }) => {
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    const [resolver] = await generate(config, entities);
    expect(resolver.name).toBe("resolvers/author/saveAuthorMutation.ts");
    expect(renderCodegenFile(resolver, config)).toMatchInlineSnapshot(`
     "import { Author } from "${entitiesImport}";
     import type { MutationResolvers } from "${graphqlTypesImport}";
     import { saveEntity } from "${utilsImport}";

     export const saveAuthor: Pick<MutationResolvers, "saveAuthor"> = {
       async saveAuthor(_, args, ctx) {
         return { author: await saveEntity(ctx, Author, args.input) };
       },
     };
     "
    `);
  });
});

async function generate(config: Config, opt: EntityDbMetadata[] | Partial<DbMetadata>) {
  return generateSaveResolvers(config, newDbMeta(opt));
}
