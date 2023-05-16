---
title: FAQ
position: 10
---

## Does Joist support `number` id fields?

Joist supports both `int` and `uuid` primary key columns _in the database_, but currently only supports exposing them as strings (i.e. tagged ids like `"a:1"` or tagged-or-untagged uuids like `"a:123e4567-e89b-12d3-a456-426614174000"`).

Supporting `int` columns exposed as JS `number`s is doable, we just haven't needed it, see [support number id columns](https://github.com/stephenh/joist-ts/issues/368).

## What databases does Joist support?

Currently only Postgres; see [support other databases](https://github.com/stephenh/joist-ts/issues/636).
