import { enumValues, mappers } from "./graphql-codegen-joist.mjs";

// We modeled ProjectTeamMember to allow a resolver to return placeholder objects as
// potential/unassigned values. This means they can't be mapped types they may not necessarily be just an entity.
const { ProjectTeamMember, ...joistMappers } = mappers;

export default {
  overwrite: true,
  schema: "./schema/**/*.graphql",
  documents: null,
  generates: {
    "src/generated/graphql-types.ts": {
      config: {
        // The resolver plugin still uses this plugin-specific setting to append .js imports.
        emitLegacyCommonJSImports: false,
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
      plugins: ["@homebound/graphql-typescript-simple-resolvers"],
    },
  },
};
