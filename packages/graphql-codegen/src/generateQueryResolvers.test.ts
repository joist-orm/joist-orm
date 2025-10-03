import { DbMetadata, EntityDbMetadata } from "joist-codegen";
import { generateQueryResolvers } from "./generateQueryResolvers";
import { newDbMeta, newEntityMetadata } from "./testUtils";

describe("generateQueryResolvers", () => {
  it("creates a new file", async () => {
    // Given an author
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    // When ran
    const [resolver] = await generate(entities);
    // We now have a graphql file
    expect(resolver.name).toBe("resolvers/author/authorQuery.ts");
    expect(resolver.contents.toString()).toMatchInlineSnapshot(`
     "import type { QueryResolvers } from "src/generated/graphql-types";

     export const author: Pick<QueryResolvers, "author"> = {
       async author(_, args, ctx) {
         return ctx.em.load(Author, args.id);
       },
     };
     "
    `);
  });
});

async function generate(opt: EntityDbMetadata[] | Partial<DbMetadata>) {
  return generateQueryResolvers(newDbMeta(opt));
}
