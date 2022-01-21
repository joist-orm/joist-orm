---
title: Modeling Options
slug: /modeling
sidebar_label: Overview
sidebar_position: 0
---

Joist focuses on providing multiple ways for you to best model your application's domain model.

- [Nullable columns](./nullable-columns.md) models `null` vs `not-null` columns
- [Many To Ones](./many-to-ones.md) models children pointing to parents
- [One To Manys](./one-to-manys.md) models parents pointing to children
- [One To Ones](./one-to-ones.md) models ...one-to-ones...
- [Enum Tables](./enum-tables.md) for modeling state/status fields
- [Polymorphic References](./polymorphic-references.md) models when a child can point to different types of parents
- [Derived Fields](./derived-fields.md) model fields calculated from other values in your domain model
- [Protected Fields](./protected-fields.md) allow restricting who can set fields
- [JSONB Fields](./jsonb-fields.md) support Postgres's `jsonb` column type
