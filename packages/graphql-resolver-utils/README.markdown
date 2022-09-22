
# joist-graphql-codegen

This is an optional extension to Joist's codegen logic to generate additional GraphQL-specific output.

The core `joist-orm`/etc. is GraphQL/REST/etc. agnostic, but pragmatically much of Joist's development is driven by implementing a TypeScript/Apollo GraphQL service, so this module helps with some of the glue code.

## Configuration

In your `joist-codegen.json` add an additional setting:

```json
{
  "codegenPlugins": ["joist-graphql-codegen"]
}
```

## Generated files

This will generate:

* `schema/enums.graphql` with a GraphQL version of each Joist/domain enum

  For entities, Joist takes an "arms-length" stance on GraphqL integration, i.e. a GraphQL entity type `Book` will probably match 80% of the Joist domain entity type `Book`, but the last 20% will be bespoke, and so the two need to float independently.
  
  This arms-length caution seems less necessary for enums, so `enums.graphql` will contain a one-to-one mapping of GraphQL enums that exactly the domain enums.
  
* `src/resolvers/enumResolvers.ts` includes resolvers for the "enum detail" pattern

  Given "turn this code into a name" if a frequent operation for frontends, our enum detail pattern allows wrapping each enum with an object type that exposes both the `code` (i.e. the enum value itself) as well as the name (as driven by the `name` column in the enum's database table).

* `./graphql-codegen-joist.js` contains `mappers` and `enumValues` config values to `require` into your primary `graphql-codegen.js` file.

  `mappers` declares every entity as a mapped type to its strongly-typed id, i.e. `Book: BookId` (which becomes the root type of the entity's resolver).
  
  `enumValues` tells graphql-code-generator to use the existing/Joist-generated `src/entities` enum declarations instead of re-creating its own enums in `graphql-types.ts`.

## Todo

* Remove the hard-coded file paths like `@src/resolvers`/etc.

