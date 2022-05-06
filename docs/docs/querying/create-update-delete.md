---
title: Create/Update/Delete
sidebar_position: 2
---

All work is made off of the Joist entity manager. When `.flush()` is called on the entity manager, Joist will perform all the hooks and validation checks before writing to the database. Flush can be called multiple times as work is done an entities.

For example:

```ts
const em = newEntityManager();
const author = new Author(em, { firstName: "a1" });
await em.flush();
author.firstName = "a2";
await em.flush();
```


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
