import { generateResolverUtils } from "./generateResolverUtils";
import { renderCodegenFile } from "./testUtils";

describe("generateResolverUtils", () => {
  it("generates cursor resolver utils", () => {
    const [utils] = generateResolverUtils({ paginationStyle: "cursor" } as never);
    expect(utils.name).toBe("resolvers/utils.ts");
    expect(renderCodegenFile(utils, {} as never)).toMatchInlineSnapshot(`
      "import { entityResolver, paginateCursor, saveEntity } from \"joist-graphql-resolver-utils\";

      export { entityResolver, paginateCursor as paginate, saveEntity };
      "
    `);
  });

  it("generates limit resolver utils", () => {
    const [utils] = generateResolverUtils({ paginationStyle: "limit" } as never);
    expect(utils.name).toBe("resolvers/utils.ts");
    expect(renderCodegenFile(utils, {} as never)).toMatchInlineSnapshot(`
      "import { entityResolver, paginateLimit, saveEntity } from \"joist-graphql-resolver-utils\";

      export { entityResolver, paginateLimit as paginate, saveEntity };
      "
    `);
  });

  it("generates test utils", () => {
    const [, testUtils] = generateResolverUtils({ paginationStyle: "cursor" } as never);
    expect(testUtils.name).toBe("resolvers/testUtils.ts");
    expect(renderCodegenFile(testUtils, {} as never)).toMatchInlineSnapshot(`
     "import {
       makeMakeRunInputMutation,
       makeMakeRunObjectField,
       makeMakeRunObjectFields,
       makeMakeRunQuery,
       type MakeRunInputMutation,
       type MakeRunObjectField,
       type MakeRunObjectFields,
       type MakeRunQuery,
     } from "joist-graphql-resolver-utils/tests";

     import { type Context, run } from "joist-test-utils";

     export { run };

     export const makeRunInputMutation: MakeRunInputMutation<Context> = makeMakeRunInputMutation(run);
     export const makeRunObjectField: MakeRunObjectField<Context> = makeMakeRunObjectField(run);
     export const makeRunObjectFields: MakeRunObjectFields<Context> = makeMakeRunObjectFields(run);
     export const makeRunQuery: MakeRunQuery<Context> = makeMakeRunQuery(run);
     "
    `);
  });
});
