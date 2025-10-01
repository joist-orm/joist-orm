import { camelCase, sentenceCase } from "change-case";
import { DbMetadata } from "joist-codegen";
import { CodegenFile, code, imp } from "ts-poet";

const queryResolvers = imp("QueryResolvers@#src/generated/graphql-types");
const makeRunResolver = imp("makeRunInputMutation@#src/resolvers/testUtils");

/**
 * Generates top-level query resolvers.
 */
export function generateQueryResolvers(db: DbMetadata): CodegenFile[] {
  const resolvers = db.entities.map((e) => {
    const { name } = e;
    const camelName = camelCase(name);
    const type = imp(`${name}@#src/entities`);
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
    const resolverConst = imp(`${camelName}@#src/resolvers/${camelName}/${camelName}Query`);
    return {
      name: `resolvers/${camelName}/${camelName}Query.test.ts`,
      overwrite: false,
      contents: code`
        describe("${camelName}", () => {
          it.withCtx("returns a ${sentenceCase(name)}", async (ctx) => {
            const ${tagName} = ${imp(`new${name}@#src/entities`)}(ctx.em);
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
