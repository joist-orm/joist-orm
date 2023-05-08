---
title: FAQ
position: 10
---

## Does Joist have any gotchas?

Yes; while we've used Joist in production for 3 years, there are still a few gotchas (sharp edges) worth calling out:

1. `em.find` queries should not be called in a loop.

  While Joist is fanatical about avoiding N+1s, today this only works for object graph navigation (i.e. `await author.books.load()` or similar `em.populate` calls).
  
  Because `em.find` queries issue custom SQL, Joist's current N+1 avoidance/auto-batching for them technically works, but produces fairly esoteric queries, and needs reworked, see [move away from UNION ALL for batch em.finds](https://github.com/stephenh/joist-ts/issues/441) which hopes to fix this.

  In practice, we've found it amenable to make `em.find` queries only at the top-level of an endpoint or GraphQL mutation, and use object graph navigation for anything non-top-level.

2. Particularly complex reactive fields may miss updates, see [expansion of complex transitive reactive hints](https://github.com/stephenh/joist-ts/issues/626)

## Does Joist support `number` id fields?

Joist supports both `int` and `uuid` primary key columns _in the database_, but currently only supports exposing them as strings (i.e. tagged ids like `"a:1"` or uuids like `"a:123e4567-e89b-12d3-a456-426614174000"`).

Supporting `int` columns exposed as JS `number`s is doable, we just haven't needed it, see [support number id columns](https://github.com/stephenh/joist-ts/issues/368).

## What databases does Joist support?

Currently only Postgres; see [support other databases](https://github.com/stephenh/joist-ts/issues/636).
