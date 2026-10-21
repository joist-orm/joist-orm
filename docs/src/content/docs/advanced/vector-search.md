---
title: Vector Search
description: Storing and querying pgvector embeddings
sidebar:
  order: 13
---

[pgvector](https://github.com/pgvector/pgvector) adds a `vector(N)` column type to Postgres, for storing embeddings and finding the rows nearest to a query embedding.

Joist maps `vector(N)` columns to `number[]` fields, and `em.query` can select, filter, and order by their cosine distance.

## Adding a Vector Column

pgvector is an untrusted extension, so it must be created by a superuser before your migrations run (e.g. in your database's Docker image). The migration itself is a regular `addColumns`:

```ts
import { addColumns } from "joist-migration-utils";
import { MigrationBuilder } from "node-pg-migrate";

export async function up(b: MigrationBuilder): Promise<void> {
  addColumns(b, "books", { embedding: { type: "vector(1536)" } });
  b.sql(`CREATE INDEX books_embedding_idx ON books USING hnsw (embedding vector_cosine_ops)`);
}
```

Embeddings are large and rarely needed when loading an entity, so it's best to mark them as a [lazy field](/modeling/fields#lazy-fields), which keeps them out of the entity's default `SELECT`:

```json
{
  "entities": {
    "Book": {
      "fields": {
        "embedding": { "lazy": true }
      }
    }
  }
}
```

## Reading & Writing

The field is a plain `number[]`, so reads and writes are the same as any other field (or lazy field):

```ts
const book = em.create(Book, { title: "t1", embedding: await embeddingService.analyze("t1") });
await em.flush();

// Later, in another em
const book = await em.load(Book, "b:1");
const embedding = await book.embedding.load(); // number[]
```

## Querying by Distance

Vector columns have a `cosineDistance` method (pgvector's `<=>` operator) that returns a `number` expression, from `0` for the same direction to `2` for opposite directions, which you can use anywhere in an [em.query](/features/queries-raw):

```ts
const b = table(Book);
const distance = b.embedding.cosineDistance(await embeddingService.analyze("space opera"));
const rows = await em.query({
  from: b,
  select: { id: b.id, distance },
  where: distance.lte(0.5),
  orderBy: distance.asc(),
  limit: 10,
});
// rows is { id: BookId; distance: number | undefined }[]
```

The query embedding is bound as a parameter (Postgres infers its type from the `<=>` operator), so the generated SQL is:

```sql
SELECT b.id, (b.embedding <=> $1) AS distance
FROM books AS b
WHERE (b.embedding <=> $2) <= $3
ORDER BY (b.embedding <=> $4) ASC
LIMIT $5
```

Rows whose `embedding` is `NULL` have a `NULL` distance, so they are excluded by `where` conditions and sort last.
