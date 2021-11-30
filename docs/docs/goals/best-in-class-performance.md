---
title: Best-in-Class Performance
position: 4
---

Joist aims for best-in-class performance by performing all `INSERT`, `UPDATE`, `DELETE`, and even `SELECT` operations in bulk.

If you save 100 new authors, that is 1 SQL `INSERT` statement. If you update 500 books, that is 1 SQL `UPDATE` statement.

If you have a Unit of Work that has 100 new authors and 500 new books, there will be 1 SQL `INSERT` statement for the authors, and 1 SQL `INSERT` statement for the books.

This is dramatically different than other ORMs that generally issue 1 SQL statement per entity _instance_ instead of 1 SQL statement per entity _table_ (technically Joist is 1 SQL statement per entity type and operation, i.e. inserting authors and updating authors and deleting authors are separte statements).

Note that this capability, especially bulk updates, currently requires a Postgres-specific `UPDATE` syntax, but that is part of the pay-off for Joist's "unapologetically Postgres-only (for now)" approach.

