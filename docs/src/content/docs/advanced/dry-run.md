---
title: Dry Run Mode
description: Running business logic without committing
sidebar:
  order: 14
---

Joist supports a dry run mode that lets you apply potential changes to the domain model, while ensuring they won't be committed to the database.

This is useful for implementing "what if" or "oracle" features that want to show the user what would happen _if_ they made a change--but not actually make it.

## How to Use It

The `EntityManager` has three modes:

```ts
  // Allow writing changes to the database (default)
  em.mode = "writes";
  // Immediately fail any entity mutation/setter
  em.mode = "read-only";
  // Allow writes to entities, but don't commit them (i.e. oracle mode)
  em.mode = "in-memory-writes";
```

When the `mode` is set to `in-memory-writes`, then your endpoints/business logic can continue mutating the entities as normal.

You can also call `em.flush()` to **see what "downstream", hook-driven, or `ReactiveField`-driven** business logic will do, and if any **validation rules** will fail.

This is a key feature of "oracle mode" because besides just saying "sure, the `firstName` is now updated" (the potentially simple change the user is making), you can see how your business logic will react to that change.

## How It Works

When `em.flush` is called in `in-memory-writes` mode, Joist will:

* Still open a transaction
* Apply the same `INSERT`, `UPDATE`, `DELETE` statements as normal
* Recalc any `ReactiveQueryField`s if necessary (these are SQL queries that need to see the data applied in the previous step to recalc themselves)
* Run validation rules as normal
* Abort the transaction

This implementation is actually really simple--Joist just does "everything as normal", but then slips in an `ABORT` at the very end of the transaction.

This is both good for simplicity, but also means it's very robust in terms of matching the regular / "not dry mode" behavior.

And it's also extremely easy for your app to use--none of your code needs to change, apart from the one-liner of setting `mode`.

