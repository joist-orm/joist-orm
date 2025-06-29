import { DbMetadata, EntityDbMetadata } from "joist-codegen";
import { keyBy } from "joist-utils";
import { generateQueryResolvers } from "./generateQueryResolvers";
import { newEntityMetadata } from "./testUtils";

describe("generateQueryResolvers", () => {
  it("creates a new file", async () => {
    // Given an author
    const entities: EntityDbMetadata[] = [newEntityMetadata("Author")];
    // When ran
    const [resolver] = await generate(entities);
    // We now have a graphql file
    expect(resolver.name).toBe("resolvers/author/authorResolver.ts");
    expect(resolver.contents.toString()).toMatchInlineSnapshot(`
     "import { QueryResolvers } from "src/generated/graphql-types";

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
  const entities = Array.isArray(opt) ? opt : (opt.entities ?? []);
  const entitiesByName = keyBy(entities, "name");

  // Hook up baseType/subTypes
  for (const entity of entities) {
    if (entity.baseClassName) {
      const baseType = entitiesByName[entity.baseClassName];
      entity.baseType = baseType;
      baseType.subTypes.push(entity);
    }
  }

  const dbMeta = {
    entities,
    enums: {},
    pgEnums: {},
    joinTables: [],
    totalTables: 10,
    entitiesByName,
  } satisfies DbMetadata;
  return generateQueryResolvers(dbMeta);
}
