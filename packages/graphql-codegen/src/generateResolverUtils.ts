import { Config } from "joist-codegen";
import { CodegenFile, code, imp } from "ts-poet";

/** Generates project-level resolver utility exports. */
export function generateResolverUtils(config: Config): CodegenFile[] {
  const paginate = (config.paginationStyle ?? "cursor") === "limit" ? "paginateLimit" : "paginateCursor";
  return [
    {
      name: "resolvers/utils.ts",
      overwrite: false,
      contents: code`
        export {
          ${imp("entityResolver@joist-graphql-resolver-utils")},
          ${imp(`${paginate}@joist-graphql-resolver-utils`)} as paginate,
          ${imp("saveEntity@joist-graphql-resolver-utils")},
        };
      `,
    },
    {
      name: "resolvers/testUtils.ts",
      overwrite: false,
      contents: code`
        import { type Context, run } from "joist-test-utils";

        export { run };

        export const makeRunInputMutation: ${imp("t:MakeRunInputMutation@joist-graphql-resolver-utils/tests")}<Context> = ${imp("makeMakeRunInputMutation@joist-graphql-resolver-utils/tests")}(run);
        export const makeRunObjectField: ${imp("t:MakeRunObjectField@joist-graphql-resolver-utils/tests")}<Context> = ${imp("makeMakeRunObjectField@joist-graphql-resolver-utils/tests")}(run);
        export const makeRunObjectFields: ${imp("t:MakeRunObjectFields@joist-graphql-resolver-utils/tests")}<Context> = ${imp("makeMakeRunObjectFields@joist-graphql-resolver-utils/tests")}(run);
        export const makeRunQuery: ${imp("t:MakeRunQuery@joist-graphql-resolver-utils/tests")}<Context> = ${imp("makeMakeRunQuery@joist-graphql-resolver-utils/tests")}(run);
      `,
    },
  ];
}
