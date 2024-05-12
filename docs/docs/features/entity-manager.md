---
title: Entity Manager
sidebar_position: 1
---

Joist's `EntityManager` is how entities are loaded from & saved to the database.

Each request should get its own `EntityManager`, which will coordinate loading & saving entities for that request, effectively acting as a Unit of Work for the request (see [Unit of Work](../advanced/unit-of-work) for more details).

:::info

This means that entities must be loaded from the `EntityManager`, i.e. via `em.load(Author, 1)`, and not from methods on `Author`, i.e. like the prototypical ActiveRecord `Author.find_by_id(1)` methods in Rails.

:::

All work is made off of the Joist entity manager. When `.flush()` is called on the entity manager, Joist will perform all the hooks and validation checks before writing to the database. Flush can be called multiple times as work is done an entities.

For example:

```ts
const em = newEntityManager();
const author = new Author(em, { firstName: "a1" });
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
Load an instance of a given entity and id

```ts
const em = newEntityManager();
const a = await em.create(Author, { email: 'foo@bar.com' });
```

Optionally, another way to create an entity is to do:

```ts
const em = newEntityManager();
const a = new Author(em, { firstName: "a1", address: { street: "123 Main" } });
```


### `#createOrUpdatePartial`

```ts
const em = newEntityManager();
const a1 = await em.createOrUpdatePartial(Author, { firstName: "a1" });
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
const author = new Author(em, { firstName: "a1" });
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

