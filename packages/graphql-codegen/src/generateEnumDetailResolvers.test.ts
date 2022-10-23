import { generateEnumDetailResolvers } from "./generateEnumDetailResolvers";

describe("generateEnumDetailResolvers", () => {
  it("creates a new file", async () => {
    const file = await generateEnumDetailResolvers({});
    expect(file.contents.toString()).toMatchInlineSnapshot(`
      "import { Resolvers } from "src/generated/graphql-types";

      type EnumDetails = never;

      export const enumResolvers: Pick<Resolvers, EnumDetails> = {};
      "
    `);
  });
});
