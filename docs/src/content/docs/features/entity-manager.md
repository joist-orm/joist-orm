---
title: Entity Manager
description: Documentation for Entity Manager
sidebar:
  order: 1
---

Joist's `EntityManager` is how entities are loaded from & saved to the database.

Each request should get its own `EntityManager`, which will coordinate loading & saving entities for that request, effectively acting as a Unit of Work for the request (see [Unit of Work](../advanced/unit-of-work) for more details).

:::tip[Info]

This means that entities must be loaded from the `EntityManager`, i.e. via `em.load(Author, 1)`, and not from methods on `Author`, i.e. like the prototypical ActiveRecord `Author.find_by_id(1)` methods in Rails.

:::

All work is made off of the Joist entity manager. When `.flush()` is called on the entity manager, Joist will perform all the hooks and validation checks before writing to the database. Flush can be called multiple times as work is done an entities.

If an `em.flush` fails, i.e. with a validation error, the `EntityManager` cannot flush again, and later `em.flush` calls throw a `FailedFlushError`. A failed flush may have already run hooks, reactions, or SQL statements, so Joist doesn't try to resume from it; start over with a new `EntityManager` instead.

For example:

```ts
const em = newEntityManager();
const author = em.create(Author, { firstName: "a1" });
await em.flush();
author.firstName = "a2";
await em.flush();
```

## Features

### Auto-Batch Updates

Initially using an `EntityManager` can feel awkward, especially for saving changes via `em.flush()` because you "don't see", don't type out, the individual `INSERT` / `UPDATE` / `DELETE` SQL calls that Joist issues for each entity.

However, letting Joist handle this means it can apply your SQL changes in the most efficient manner possible:

1. It first opens a transaction so call mutations are made atomically
2. It then issues a single "assign new ids" `SELECT` statement to get ids for any newly-inserted entities, from their respective sequences.
3. Next it issues 1 batch-insert/batch-update/batch-delete statement for each entity type that's created/updated/deleted.
   - We automatically leverage Postgres's `DEFERRED FOREIGN KEY` constraints to avoid entity-insert ordering issues
   - The batching logic will use multiple batches if needed, depending on the number of rows & columns being updated (to stay under PostgreSQL's max parameter limit)
4. Finally, `COMMIT` all the changes

## API

### `#create`
Create a new entity.

```ts
const em = newEntityManager();
const a = await em.create(Author, { email: 'foo@bar.com' });
```

Relationships accept entity instances, registered client IDs, and, for many-to-one references, database IDs:

```ts
const em = newEntityManager();
const a = em.create(Author, { firstName: "a1" });
const b = em.create(Book, { title: "b1", author: a });
```


### `#upsert`

```ts
const em = newEntityManager();
const a1 = await em.upsert(Author, { firstName: "a1" });
```

`upsert` accepts deep partial input. Pass `id` to update an existing entity, using its database ID or registered client ID.
Without `id`, upsert creates a new entity unless `uniqueBy` matches a soft-deleted row, which it restores and updates.
To update a row that is not soft-deleted, pass its `id`; matching its unique fields is not enough.
Setting `id: null` always creates a new entity without resurrection.

### Client IDs

`$clientId` gives an entity an addressable identity before it has a database primary key. It is scoped to one
`EntityManager`, not persisted, and not a cross-request upsert key.

```ts
const em = newEntityManager();

// The author already exists in the database.
const existingAuthor = await em.load(Author, "a:123");

// Create a new author with a new book.
const author = em.create(Author, {
  $clientId: "a#7",
  firstName: "Ursula",
  lastName: "Le Guin",
});

// And the book can refer to both the newly-added author and the existing reviewer via IDs.
const book = em.create(Book, {
  $clientId: "b#2",
  title: "A Wizard of Earthsea",
  // Registered, newly created author.
  author: "a#7",
  // Existing database author.
  reviewer: existingAuthor.id,
});

await em.flush();
// Still "a#7".
author.$clientId;
// A database ID, e.g. "a:124".
author.id;
// true.
(await em.load(Author, author.id)) === author;
```


### `#setPartial`

```ts
const em = newEntityManager();
const a1 = em.create(Author, { firstName: "a1" });
a1.setPartial({ firstName: 'a:2 });
```

### Updating a field
Another option to updating is setting the field directly.

```ts
const em = newEntityManager();
const author = em.create(Author, { firstName: "a1" });
await em.flush();
author.firstName = "a2";
await em.flush();
```

### `#delete`

```ts
const em = newEntityManager();
const a1 = await em.load(Author, "1");
em.delete(a1);
```

### `#load`

Load an instance of a given entity and id.

This will return the existing `Author:1` instance if it's already been loaded from the database.

```ts
const em = newEntityManager();
const a = await em.load(Author, "a:1");
```

- Returns
    - Entity if found
    - throws `Error` if not


### `#loadAll`

Load multiple instances of a given entity and ids, and fails if any id does not exist.

```ts
const em = newEntityManager();
const a = await em.loadAll(Author, ["a:1", "a:2"]);
```

- Returns
    - Array of entities if found
    - throws `Error` if not


### `#loadAllIfExists`

Load multiple instances of a given entity and ids, and ignores ids that don't exist.

```ts
const em = newEntityManager();
const a = await em.loadAllIfExists(Author, ["a:1", "a:2"]);
```
