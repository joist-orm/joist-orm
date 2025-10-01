import { DbMetadata, EntityDbMetadata } from "joist-codegen";
import { generateSaveResolvers } from "./generateSaveResolvers";
import { newDbMeta, newEntityMetadata } from "./testUtils";

describe("generateSaveResolvers", () => {
  it("creates a new file", async () => {
    // Given an author
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    // When ran
    const [resolver] = await generate(entities);
    // We now have a graphql file
    expect(resolver.name).toBe("resolvers/author/saveAuthorMutation.ts");
    expect(resolver.contents.toString()).toMatchInlineSnapshot(`
     "import { Author } from "#src/entities";
     import { MutationResolvers } from "#src/generated/graphql-types";
     import { saveEntity } from "#src/resolvers/utils";

     export const saveAuthor: Pick<MutationResolvers, "saveAuthor"> = {
       async saveAuthor(_, args, ctx) {
         return { author: await saveEntity(ctx, Author, args.input) };
       },
     };
     "
    `);
  });
});

async function generate(opt: EntityDbMetadata[] | Partial<DbMetadata>) {
  return generateSaveResolvers(newDbMeta(opt));
}
