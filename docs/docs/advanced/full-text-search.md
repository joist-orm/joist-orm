---
title: Full Text Search
sidebar_position: 35
---

Postgres has rich support for [full text search functionality](https://www.postgresql.org/docs/current/functions-textsearch.html), which can be a replacement for more dedicated solutions such as Elasticsearch.

One of the challenges of implementing a Postgres `tsvector` search index is keeping the index data in sync with changes, especially across tables. Consider a search endpoint for `Books`, in addition to being able to search for the `Book` by `title`, we may also want to search for the `Book` by the related `Author` `name`.

The conventional approach would be to use triggers to react to updates and keep the index in sync, but Joist can improve on the ergonomics of this approach through the use of [Reactive Fields](../modeling/reactive-fields.md).

## Adding Search Index Columns

First, we'll start by creating 2 columns:

1. A plain `text` column to derive the search string.
2. A `tsvector` type `DERIVED` column that will cast our `text` search column `to_tsvector`.

```ts
import { addColumns } from "joist-migration-utils";
import { MigrationBuilder } from "node-pg-migrate";

export async function up(b: MigrationBuilder): Promise<void> {
  addColumns(b, "books", { search: { type: "text" }});

  // Then create a "generated" column, allowing postgres to handle the `to_tsvector` word stemming.
  b.sql(`
    ALTER TABLE books
    ADD COLUMN ts_search tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(search, ''))) STORED;

    CREATE INDEX ts_search_idx ON books USING GIN (ts_search);
  `);
}
```

:::info

Even though two columns looks odd here, so far we've found it to be the best solution that allows both:

1. Joist to control the `search` field, i.e. on both reads & writes be able to see/diff/update "just the plain text" value, while

2. Letting Postgres fully control the `to_tsvector` application.

:::

## Configuring the Reactive Field

We'll now set up the `Book.search` field as an [Reactive Field](../modeling/reactive-fields.md) within `joist-config.json`:

```json
{
  "entities": {
    "Book": {
      "fields": {
        "search": { "derived": "async" }
      }
    }
  }
}
```

And then implement our logic in the `Book` domain model. This will keep the values we want indexed for search for the `Book` in sync:

```typescript
import { ReactiveField, hasReactiveField } from "joist-orm";

readonly search: ReactiveField<Book, string> = hasReactiveField(
  "search",
  { author: ["firstName", "lastName"], title: {} },
  (book) => {
    const author = book.author.get;
    return `${book.title} ${author.firstName} ${author.lastName}`
  },
);
```

## Querying the `tsvector` type `ts_search` Column

```ts
// Use the buildQuery method to create a base query to build off of
const query = buildQuery(knex, Book, {});

// Use knex raw methods to craft the search query against the `ts_search` generated column 
// and (optionally) sort by the rank
void query
  .whereRaw(`ts_search @@ plainto_tsquery('english', '${searchTerm}')`)
  .orderByRaw(`ts_rank(ts_search, plainto_tsquery('english', '${searchTerm}')) DESC`);

// Then load the books for the custom search query
const books = await em.loadFromQuery(Book, query);
```

:::info

We're using Knex and `buildQuery` here because, currently, Joist's `em.find` syntax does not support raw query conditions.

See [#699](https://github.com/joist-orm/joist-orm/issues/699) which will add support for this.

:::
