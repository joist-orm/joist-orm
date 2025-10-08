import { enumValues, mappers } from "./graphql-codegen-joist.mjs";

// We modeled ProjectTeamMember to allow a resolver to return placeholder objects as
// potential/unassigned values. This means they can't be mapped types they may not necessarily be just an entity.
const { ProjectTeamMember, ...joistMappers } = mappers;

export default {
  overwrite: true,
  schema: "./schema/**/*.graphql",
  documents: null,
  emitLegacyCommonJSImports: false, // GraphQL Codegen ESM setting
  generates: {
    "src/generated/graphql-types.ts": {
      config: {
        contextType: "src/context#Context",
        noSchemaStitching: true,
        avoidOptionals: true,
        scalars: {
          Date: "Temporal.PlainDate",
          DateTime: "Temporal.ZonedDateTime",
        },
        mappers: {
          ...joistMappers,
        },
        enumValues: {
          ...enumValues,
        },
      },
      plugins: [
        { add: { content: 'import { Temporal } from "temporal-polyfill"' } },
        "@homebound/graphql-typescript-simple-resolvers",
      ],
    },
  },
};
