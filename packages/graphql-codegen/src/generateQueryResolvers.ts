import { camelCase, sentenceCase } from "change-case";
import { DbMetadata, type Config } from "joist-codegen";
import { CodegenFile, code, imp } from "ts-poet";
import { getEntitiesImportPath } from "./utils";

const queryResolvers = imp("t:QueryResolvers@src/generated/graphql-types.ts");
const makeRunResolver = imp("makeRunInputMutation@src/resolvers/testUtils.ts");

/**
 * Generates top-level query resolvers.
 */
export function generateQueryResolvers(config: Config, db: DbMetadata): CodegenFile[] {
  const entitiesPath = getEntitiesImportPath(config);
  const resolvers = db.entities.map((e) => {
    const { name } = e;
    const camelName = camelCase(name);
    return {
      name: `resolvers/${camelName}/${camelName}Query.ts`,
      overwrite: false,
      contents: code`
          export const ${camelName}: Pick<${queryResolvers}, "${camelName}"> = {
            async ${camelName}(_, args, ctx) {
              return ctx.em.load(${name}, args.id);
            },
          };
        `,
    };
  });

  const testFiles = db.entities.map((e) => {
    const { name, tagName } = e;
    const camelName = camelCase(name);
    const resolverConst = imp(`${camelName}@src/resolvers/${camelName}/${camelName}Query.ts`);
    return {
      name: `resolvers/${camelName}/${camelName}Query.test.ts`,
      overwrite: false,
      contents: code`
        describe("${camelName}", () => {
          it.withCtx("returns a ${sentenceCase(name)}", async (ctx) => {
            const ${tagName} = ${imp(`new${name}@${entitiesPath}`)}(ctx.em);
            const result = await run(ctx, {}, "${camelName}", () => ({ id: ${tagName}.id }));
            expect(result).toMatchEntity(${tagName});
          });
        });

        const run = ${makeRunResolver}(${resolverConst});
      `,
    };
  });

  return [...resolvers, ...testFiles];
}
