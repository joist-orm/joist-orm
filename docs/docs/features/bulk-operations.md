---
title: Bulk Operations
position: 4
---

Joist aims for best-in-class performance by performing all `INSERT`, `UPDATE`, `DELETE`, and even `SELECT` operations in bulk/batch.

For example:

- If you save 100 new authors, Joist will execute 1 SQL `INSERT` statement.
- If you update 500 books, Joist will also execute 1 SQL `UPDATE` statement.

Note that this capability, especially for bulk `UPDATE`s, currently uses a Postgres-specific `UPDATE` syntax, but that is part of the pay-off for Joist's "unapologetically Postgres-only (for now)" approach.
