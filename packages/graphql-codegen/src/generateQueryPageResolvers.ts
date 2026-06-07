import { camelCase } from "change-case";
import { Config, DbMetadata } from "joist-codegen";
import pluralize from "pluralize";
import { CodegenFile, code, imp } from "ts-poet";
import { getEntitiesImportPath } from "./utils";

const queryResolvers = imp("t:QueryResolvers@src/generated/graphql-types.ts");
const makeRunQuery = imp("makeRunQuery@src/resolvers/testUtils.ts");

/** Generates paginated top-level query resolvers. */
export function generateQueryPageResolvers(config: Config, db: DbMetadata): CodegenFile[] {
  const entitiesPath = getEntitiesImportPath(config);
  return db.entities.flatMap((e) => {
    const { name } = e;
    const camelName = camelCase(name);
    const pluralName = pluralize(camelName);
    const type = imp(`${name}@${entitiesPath}`);
    const paginate = imp("paginate@src/resolvers/utils.ts");
    const resolverConst = imp(`${pluralName}@src/resolvers/${camelName}/${pluralName}Query.ts`);
    return [
      {
        name: `resolvers/${camelName}/${pluralName}Query.ts`,
        overwrite: false,
        contents: code`
          export const ${pluralName}: Pick<${queryResolvers}, "${pluralName}"> = {
            async ${pluralName}(_, args, ctx) {
              return ${paginate}(ctx, ${type}, args);
            },
          };
        `,
      },
      {
        name: `resolvers/${camelName}/${pluralName}Query.test.ts`,
        overwrite: false,
        contents: code`
          describe("${pluralName}", () => {
            it.withCtx("returns ${pluralName}", async (ctx) => {
              const result = await run(ctx);
              expect(result).toBeDefined();
            });
          });

          const run = ${makeRunQuery}(${resolverConst});
        `,
      },
    ];
  });
}
