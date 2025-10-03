import { Config, DbMetadata, EntityDbMetadata } from "joist-codegen";
import { generateSaveResolvers } from "./generateSaveResolvers";
import { newDbMeta, newEntityMetadata, renderCodegenFile } from "./testUtils";

describe("generateSaveResolvers", () => {
  it.each([
    {
      desc: "no extensions for non-ESM",
      config: { esm: false } as Config,
      snapshot: `
     "import { Author } from "src/entities";
     import type { MutationResolvers } from "src/generated/graphql-types";
     import { saveEntity } from "src/resolvers/utils";

     export const saveAuthor: Pick<MutationResolvers, "saveAuthor"> = {
       async saveAuthor(_, args, ctx) {
         return { author: await saveEntity(ctx, Author, args.input) };
       },
     };
     "
    `,
    },
    {
      desc: ".js extensions for ESM",
      config: { esm: true, allowImportingTsExtensions: false } as Config,
      snapshot: `
     "import { Author } from "src/entities/index.js";
     import type { MutationResolvers } from "src/generated/graphql-types.js";
     import { saveEntity } from "src/resolvers/utils.js";

     export const saveAuthor: Pick<MutationResolvers, "saveAuthor"> = {
       async saveAuthor(_, args, ctx) {
         return { author: await saveEntity(ctx, Author, args.input) };
       },
     };
     "
    `,
    },
    {
      desc: ".ts extensions for ESM with allowImportingTsExtensions",
      config: { esm: true, allowImportingTsExtensions: true } as Config,
      snapshot: `
     "import { Author } from "src/entities/index.ts";
     import type { MutationResolvers } from "src/generated/graphql-types.ts";
     import { saveEntity } from "src/resolvers/utils.ts";

     export const saveAuthor: Pick<MutationResolvers, "saveAuthor"> = {
       async saveAuthor(_, args, ctx) {
         return { author: await saveEntity(ctx, Author, args.input) };
       },
     };
     "
    `,
    },
  ])("generates file with $desc", async ({ config, snapshot }) => {
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    const [resolver] = await generate(config, entities);
    expect(resolver.name).toBe("resolvers/author/saveAuthorMutation.ts");
    expect(renderCodegenFile(resolver, config)).toMatchInlineSnapshot(snapshot);
  });
});

async function generate(config: Config, opt: EntityDbMetadata[] | Partial<DbMetadata>) {
  return generateSaveResolvers(config, newDbMeta(opt));
}
