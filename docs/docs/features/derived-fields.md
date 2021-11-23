---
title: Derived Fields
---

If you mark a field as derived in `joist-codegen.json`, it will not have a setter, only an `abstract` getter than you must implement, and that Joist will call to use as the column in the database.

```json
{
  "derivedFields": ["Author.initials"]
}
```

Note that this currently only works for primitive columns, and the getter must be synchronous.
