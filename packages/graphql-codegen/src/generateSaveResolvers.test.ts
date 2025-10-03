import { Config, DbMetadata, EntityDbMetadata } from "joist-codegen";
import { generateSaveResolvers } from "./generateSaveResolvers";
import { newDbMeta, newEntityMetadata, renderCodegenFile } from "./testUtils";

describe("generateSaveResolvers", () => {
  it("generates file with no extensions for non-ESM", async () => {
    const config = { esm: false } as Config;
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    const [resolver] = await generate(config, entities);
    expect(resolver.name).toBe("resolvers/author/saveAuthorMutation.ts");
    expect(renderCodegenFile(resolver, config)).toMatchInlineSnapshot(`
     "import { Author } from "src/entities";
     import type { MutationResolvers } from "src/generated/graphql-types";
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
    const config = { esm: true, allowImportingTsExtensions: false } as Config;
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    const [resolver] = await generate(config, entities);
    expect(resolver.name).toBe("resolvers/author/saveAuthorMutation.ts");
    expect(renderCodegenFile(resolver, config)).toMatchInlineSnapshot(`
     "import { Author } from "src/entities/index.js";
     import type { MutationResolvers } from "src/generated/graphql-types.js";
     import { saveEntity } from "src/resolvers/utils.js";

     export const saveAuthor: Pick<MutationResolvers, "saveAuthor"> = {
       async saveAuthor(_, args, ctx) {
         return { author: await saveEntity(ctx, Author, args.input) };
       },
     };
     "
    `);
  });

  it("generates file with .ts extensions for ESM with allowImportingTsExtensions", async () => {
    const config = { esm: true, allowImportingTsExtensions: true } as Config;
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    const [resolver] = await generate(config, entities);
    expect(resolver.name).toBe("resolvers/author/saveAuthorMutation.ts");
    expect(renderCodegenFile(resolver, config)).toMatchInlineSnapshot(`
     "import { Author } from "src/entities/index.ts";
     import type { MutationResolvers } from "src/generated/graphql-types.ts";
     import { saveEntity } from "src/resolvers/utils.ts";

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
