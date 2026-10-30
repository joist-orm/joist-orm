---
title: PostgreJS
description: Using PostgreJS instead of node-pg
---

Joist supports [PostgreJS](https://www.npmjs.com/package/postgrejs) as an alternative to node-pg.

Using PostgreJS involves just swapping out a different `PostgreJsDriver` when booting up your application, and then everything else is the same--no change to entities or application code.

## Native Lazy Rows Support

The biggest reason for using PostgreJS is that it has native support for Joist's "lazy rows" optimization.

This optimization is that, when data arrives off the wire from postgres, we _avoid parsing the values into JavaScript primitives on the heap_ until the entity for that database row needs each specific cell of data.

Joist applications can technically achieve this same performance optimization with node-pg, by setting the `lazyRows` flag of `PostgresDriver`, but Joist's internals end up monkey-patching node-pg to make the optimization work.

With PostgreJS, our optimization is supported as a first-class feature. 🎉

## Setup

Install `postgrejs@3.14.1`, then pass its driver to your `EntityManager`:

```typescript
import { PostgreJsDriver } from "joist-orm/postgrejs";
import { Pool } from "postgrejs";

const postgreJsPool = new Pool(process.env.DATABASE_URL);
const driver = new PostgreJsDriver(postgreJsPool);

// Reuse the pool/driver; create an EntityManager per request.
const em = new EntityManager(ctx, driver);

// On application shutdown:
await postgreJsPool.close();
```

## Codegen Disclaimer

Currently Joist's migrations and `joist-codegen` step still use node-pg, but those are only for build steps.
