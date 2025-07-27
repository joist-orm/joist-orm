---
title: MikroORM
description: Comparison to MikroORM
sidebar:
  order: 5
---


## Similarities

Both Joist and Mikro use the unit-of-work pattern, a per-request cache that simplifies DX.

Both Joist and Mikro use `class` entities to hold your domain logic.

Both Joist and Mikro have similar `EntityManager` APIs (Joist was inspired by Mikro).

## Differences

Joist is newer, simpler, & more opinionated.

Mikro is an older project, into it's V6, and has accumulated "several ways of doing things", i.e. ~2-3 approaches to config (decorators vs. `EntitySchema`), two approaches to relations (with & without `Ref`s), opt-in (off by default) dataloader support, optional [Repository pattern](https://mikro-orm.io/docs/repositories), etc--where as Joist tries to be more opinionated and have **just the single "best" way**.

Joist's relations are always type-safe/load-safe, i.e. always lazy & must be `populate`-d, which is marked in the type system; Mikro has this feature (inspired by Joist), but has kept its legacy "direct entity" approach, similar to TypeORM, which can lead to very frustrating errors when accessing relations that are not yet loaded.

Mikro can use decorators to define entities (which can get clunky, see their [config ocs](https://mikro-orm.io/docs/metadata-providers)); Joist generally considers [decorators an anti-pattern](/blog/avoiding-decorators).

Mikro supports many more databases, including no-SQL like MongoDB; Joist only supports Postgres.

Mikro has a low-level query builder (for `SUM`, `GROUP BY`, etc); Joist has users drop-down to Knex (or whatever low-level query builder they prefer). Joist will probably have a [low-level query builder](https://github.com/joist-orm/joist-orm/issues/188) someday, but with 90-95% of our queries going through `em.find`, we've not needed to prioritize it yet.

Joist's `EntityManager` API has several powerful methods like `findOrCreate` and `findWithNewOrChanged` that do both in-database & in-memory lookups (i.e. if you've already made a new `User` with name `Bob`, `findOrCreate` will "find it" in-memory and not make "a 2nd bob" instance).

Joist can easily be run with `tsx`; Mikro's decorators require a `tsc`-based tool like `ts-node`.

Joist's `em.find` API supports [condition pruning](/features/queries-find/#condition--join-pruning) for ergonomic filter/listing endpoints.

Joist has first-class support for GraphQL, including ever-green schema scaffolding.
