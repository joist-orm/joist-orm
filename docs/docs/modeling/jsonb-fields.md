---
title: JSONB Fields
sidebar_position: 9
---

Postgres has rich support for [storing JSON](https://www.postgresql.org/docs/current/datatype-json.html), which Joist can integrate with.

### Joist's JSONB Features

* Runtime validation (on save) of the `jsonb` data via the [superstruct](https://docs.superstructjs.org/) library

  While Postgres itself does not enforce a schema on `jsonb` columns, doing so can generally be good practice, and so Joist allows representing and enforcing a schema within the domain model.

  Schema enforcement is also optional; if no superstruct is configured for a field, it will be modeled as just `Object`.

* Strongly typed entity fields, i.e. `Author.address` will be an `Address`

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

* `address` is a structure that defines the schema/shape of the data to store
* `Address` is the TypeScript type system that Superstruct will derive for us

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

* Joist currently doesn't support querying / filtering against `jsonb` columns, i.e. in `EntityManager.find` clauses.

  In theory this is doable, but just hasn't been implemented yet; Postgres supports quite a few operations on `jsonb` columns, so it might be somewhat involved. See [jsonb filtering support](https://github.com/stephenh/joist-ts/issues/230).

  Instead, for you, can you use raw SQL/knex queries and use `EntityManager.loadFromQuery` to turn the low-level `authors` rows into `Author` entities.

* Joist currently loads an entire row of data at a time, so if you have particularly large `jsonb` values in an entity's row, then any load of that row will also return the `jsonb` data.

  Eventually [lazy column support](https://github.com/stephenh/joist-ts/issues/178) should mitigate this, and allow marking `jsonb` columns as lazy, such that they would not be automatically fetched with an entity unless explicitly requested as a load hint.





