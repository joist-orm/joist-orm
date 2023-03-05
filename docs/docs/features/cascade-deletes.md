---
title: Cascading Deletes
---

You can have a parent cascade delete its children by doing:

```typescript
bookConfig.cascadeDelete("reviews");
```

You can also use database foreign key cascades, but using the domain-level `cascadeDelete` will mean that any application-layer hooks/validation logic/etc. that might need to run due to the review being deleted will be run during `em.flush()`.

Currently, Joist does not automatically cascade delete children; i.e. it could/may eventually use the database metadata of a foreign key with `ON CACADE DELETE` to know it should generate a `cascadeDelete(...)` in the base codegen file, but for now you have to manually specify any cascade deletions that you want.
