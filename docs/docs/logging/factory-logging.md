---
title: Factory Logging
sidebar_position: 3
---

Joist provides factory logging to visualize how factories create entities.

## Usage

Factory logging can be enabled globally by calling `setFactoryLogging`:

```ts
import { setFactoryLogging } from "joist-orm";
setFactoryLogging(true);
```

Or enabled on individual factory calls using `useLogging`:

```ts
const b1 = newBook(em, { useLogging: true });
```

Both will create output like:

```
Creating new Book at EntityManager.factories.test.ts:51
  author = creating new Author
    created Author#1 added to scope
  created Book#1 added to scope
```

Where level of indentation shows the factories creating a required entity.

I.e. the above output shows how creating a book requires an `Author`.

## Output Terminology

- `created (entity) added to scope`

   Each factory call, i.e. `newBook`, creates a scope/cache of entities that it uses or has created, to prevent creating the same entity multiple times.

   When you see the `added to scope` message, it means that the entity was created and added to the scope, and so might later be used for another field/relation later within the same factory call.

- `...adding (entity) opt to scope`

   When you pass existing entities to a factory, i.e. `newBook(em, { author })`, any entity found within the opts param are automatically added to the scope cache.

   The rationale is that the `author'`s presence in `opts` signifies it's likely "the most relevant author" for any other author lookup within this `newBook` call.

- `(field) = (entity) from scope`

   The `field` was assigned an `entity` that we found in the scope cache, i.e. that the top-level factory call had previously created this entity, or had this entity seeded into the scope cache from an opt parameter.

- `(field) = (entity) from opt`

   The `field` was assigned an `entity` that was explicitly passed as an opt/parameter to the factory call.

## Colorized Output

Currently, the factory logging always output colorized output, similar to Joist's other logging output.

This makes for the best experience with running/debugging tests, like in Jest, which is currently the primary use case for Joist's logging.

