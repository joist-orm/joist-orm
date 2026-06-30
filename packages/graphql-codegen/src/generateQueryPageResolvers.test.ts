import { Config, DbMetadata, EntityDbMetadata } from "joist-codegen";
import { generateQueryPageResolvers } from "./generateQueryPageResolvers";
import { newDbMeta, newEntityMetadata, renderCodegenFile } from "./testUtils";

describe("generateQueryPageResolvers", () => {
  it("generates cursor resolver", async () => {
    const config = { esm: false, paginationStyle: "cursor" } as Config;
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    const [resolver] = await generate(config, entities);
    expect(resolver.name).toBe("resolvers/author/authorsQuery.ts");
    expect(renderCodegenFile(resolver, config)).toMatchInlineSnapshot(`
     "import { Author } from "src/entities";
     import type { QueryResolvers } from "src/generated/graphql-types";
     import { paginate } from "src/resolvers/utils";

     export const authors: Pick<QueryResolvers, "authors"> = {
       async authors(_, args, ctx) {
         return paginate(ctx, Author, args);
       },
     };
     "
    `);
  });

  it("generates limit resolver", async () => {
    const config = { esm: false, paginationStyle: "limit" } as Config;
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    const [resolver] = await generate(config, entities);
    expect(resolver.name).toBe("resolvers/author/authorsQuery.ts");
    expect(renderCodegenFile(resolver, config)).toMatchInlineSnapshot(`
     "import { Author } from "src/entities";
     import type { QueryResolvers } from "src/generated/graphql-types";
     import { paginate } from "src/resolvers/utils";

     export const authors: Pick<QueryResolvers, "authors"> = {
       async authors(_, args, ctx) {
         return paginate(ctx, Author, args);
       },
     };
     "
    `);
  });
});

async function generate(config: Config, opt: EntityDbMetadata[] | Partial<DbMetadata>) {
  return generateQueryPageResolvers(config, newDbMeta(opt));
}
