import { Config, DbMetadata, EntityDbMetadata } from "joist-codegen";
import { generateSaveResolvers } from "./generateSaveResolvers";
import { newDbMeta, newEntityMetadata, toStringWithConfig } from "./testUtils";

describe("generateSaveResolvers", () => {
  it("generates file with no extensions for non-ESM", async () => {
    const config: Partial<Config> = { esm: false };
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    const [resolver] = await generate(config as Config, entities);
    expect(resolver.name).toBe("resolvers/author/saveAuthorMutation.ts");
    expect(toStringWithConfig(resolver, config as Config)).toMatchInlineSnapshot(`
     "import { Author } from "src/entities";
     import { MutationResolvers } from "src/generated/graphql-types";
     import { saveEntity } from "src/resolvers/utils";

     export const saveAuthor: Pick<MutationResolvers, "saveAuthor"> = {
       async saveAuthor(_, args, ctx) {
         return { author: await saveEntity(ctx, Author, args.input) };
       },
     };
     "
    `);
  });

  it("generates file with .js extensions for ESM", async () => {
    const config: Partial<Config> = { esm: true, allowImportingTsExtensions: false };
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    const [resolver] = await generate(config as Config, entities);
    expect(resolver.name).toBe("resolvers/author/saveAuthorMutation.ts");
    expect(toStringWithConfig(resolver, config as Config)).toMatchInlineSnapshot(`
     "import { Author } from "src/entities/index.js";
     import { MutationResolvers } from "src/generated/graphql-types.js";
     import { saveEntity } from "src/resolvers/utils.js";

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
