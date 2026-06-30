import joistCodegen from "./graphql-codegen-joist.js";

const { enumValues, mappers } = joistCodegen;

export default {
  overwrite: true,
  schema: "./schema/**/*.graphql",
  documents: null,
  emitLegacyCommonJSImports: true,
  generates: {
    "src/generated/graphql-types.ts": {
      config: {
        contextType: "src/context#Context",
        noSchemaStitching: true,
        avoidOptionals: true,
        scaffolding: {
          ignoreObjectsPattern: `^(${Object.keys(enumValues)
            .map((enumName) => `${enumName}Detail`)
            .join("|")})$`,
        },
        scalars: {
          Date: "Date",
          DateTime: "Date",
          JSONObject: "Object",
          BigInt: "bigint",
          IdOrName: "string",
        },
        mappers: {
          ...mappers,
        },
        enumValues: {
          ...enumValues,
        },
      },
      plugins: [
        "@homebound/graphql-typescript-simple-resolvers",
        "@homebound/graphql-typescript-possible-types",
      ],
    },
  },
};
