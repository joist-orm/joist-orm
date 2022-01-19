---
title: JSONB Fields
sidebar_position: 9
---

Postgres has rich support for [storing JSON](https://www.postgresql.org/docs/current/datatype-json.html), which Joist supports.

### Optional Strong Typing

While Postgres does not apply a schema to `jsonb` columns, this can often be useful when you do actually have/know a schema for a `jsonb` column, but are using the `jsonb` column as a more succinct/pragmatic way to store nested/hierarchical data than as strictly relational tables and columns.

To support this, Joist uses the [superstruct](https://docs.superstructjs.org/) library, which can describe both the TypeScript type for a value (i.e. `Address` has both as a `street` and a `city`), as well as do runtime validation and parsing of address values.

That said, if you do want to use the `jsonb` column effectively as an `any` object, the superstruct typing is optional, and you'll just work with `Object`s instead.

### Approach

We'll use an example of storing an `Address` with `street` and `city` fields within a single `jsonb` column.

First, define a [superstruct](https://docs.superstructjs.org/) type for the data you're going to store in `src/entities/types.ts`:

```typescript
import { Infer, object, string } from "superstruct";

export type Address = Infer<typeof address>;

export const address = object({
  street: string(),
  city: string(),
});
```

Where:

- `address` is a structure that defines the schema/shape of the data to store
- `Address` is the TypeScript type system that Superstruct will derive for us

Then tell Joist to use this `Address` type for the `Author.address` field in `joist-codegen.json`:

```json
{
  "entities": {
    "Author": {
      "fields": {
        "address": {
          "superstruct": "address@src/entities/types"
        }
      },
      "tag": "a"
    }
  }
}
```

Note that we're pointing Joist at the `address` const.

Now just run `joist-codegen` and the `AuthorCodegen`'s `address` field use the `Address` type.

### Current Limitations

There are few limitations to Joist's current `jsonb` support:

- Joist currently doesn't support querying / filtering against `jsonb` columns, i.e. in `EntityManager.find` clauses.

  In theory this is doable, but just hasn't been implemented yet; Postgres supports quite a few operations on `jsonb` columns, so it might be somewhat involved. See [jsonb filtering support](https://github.com/stephenh/joist-ts/issues/230).

  Instead, for you, can you use raw SQL/knex queries and use `EntityManager.loadFromQuery` to turn the low-level `authors` rows into `Author` entities.

- Joist currently loads an entire row of data at a time, so if you have particularly large `jsonb` values in an entity's row, then any load of that row will also return the `jsonb` data.

  Eventually [lazy column support](https://github.com/stephenh/joist-ts/issues/178) should mitigate this, and allow marking `jsonb` columns as lazy, such that they would not be automatically fetched with an entity unless explicitly requested as a load hint.
