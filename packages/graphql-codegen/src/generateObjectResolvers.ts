import { camelCase, sentenceCase } from "change-case";
import { Config, EntityDbMetadata } from "joist-codegen";
import { CodegenFile, code, imp } from "ts-poet";

const entityResolver = imp("entityResolver@src/resolvers/utils");
const makeRunObjectFields = imp("makeRunObjectFields@src/resolvers/testUtils");
const makeRunObjectField = imp("makeRunObjectField@src/resolvers/testUtils");

/**
 * Generates a base resolver using the entityResolver utility.
 *
 * This also preempts our other Joist-agnostic resolver scaffolding because [1] b/c `joist-codegen`
 * will run first and put these Joist-aware resolvers in place first.
 *
 * Then when [1] runs, it will only output resolver scaffolding for non-entity resolvers.
 *
 * [1]: https://github.com/homebound-team/graphql-typescript-resolver-scaffolding
 */
export function generateObjectResolvers(config: Config, entities: EntityDbMetadata[]): CodegenFile[] {
  const resolvers = entities.map((e) => {
    const camelName = camelCase(e.name);
    const type = imp(`${e.name}@src/entities`);
    const resolverType = imp(`${e.name}Resolvers@src/generated/graphql-types`);
    const contents = code`
      export const ${camelName}Resolvers: ${resolverType} = {
        ...${entityResolver}(${type}),
      };
    `;
    return { name: `resolvers/objects/${camelName}/${camelName}Resolvers.ts`, overwrite: false, contents };
  });

  const testFiles = entities.map((e) => {
    const { name } = e;
    const camelName = camelCase(name);
    const factory = imp(`new${name}@src/entities`);
    const resolverConst = imp(`${camelName}Resolvers@src/resolvers/objects/${camelName}/${camelName}Resolvers`);

    const tagName = config.entities[name].tag || "entity";
    const keys = e.primitives.map((field) => `"${field.fieldName}"`).join(", ");

    const contents = code`
      describe("${camelName}Resolvers", () => {
        it.withCtx("can return", async (ctx) => {
          const { em } = ctx;
          // Given a ${sentenceCase(name)}
          const ${tagName} = ${factory}(em);
          // Then we can query it
          const result = await runFields(ctx, ${tagName}, [${keys}]);
          expect(${tagName}).toMatchEntity(result);
        });
      });

      const runFields = ${makeRunObjectFields}(${resolverConst});
      const runField = ${makeRunObjectField}(${resolverConst});
    `;
    return { name: `resolvers/objects/${camelName}/${camelName}Resolvers.test.ts`, overwrite: false, contents };
  });

  return [...resolvers, ...testFiles];
}
