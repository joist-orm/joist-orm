---
title: Protected Fields
---

You can mark a field as protected in `joist-codegen.json`, which will make the setter `protected`, so that only your entity's internal business logic can call it.

The getter will still be public.

```json
{
  "entities": {
    "Author": {
      "fields": {
        "wasEverPopular": { "protected": true }
      }
    }
  }
}
```

