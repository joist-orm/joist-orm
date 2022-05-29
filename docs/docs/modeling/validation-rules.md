---
title: Validation Rules
---

Entities can have validation rules added that will be run during `EntityManager.flush()`:

```typescript
import { authorConfig as config } from "./entities"

class Author extends AuthorCodegen {
  constructor(em: EntityManager, opts: AuthorOpts) {
    super(em, opts);
  }
}

config.addRule((author) => {
  if (author.firstName && author.firstName === author.lastName) {
    return "firstName and lastName must be different";
  }
});

// Rules can be async
config.addRule(async (author) => {
  const books = await authorthis.books.load();
  // ...
});
```

If any validation rule returns a non-`undefined` string, `flush()` will throw a `ValidationErrors` error.

If you would like to skip validation rules, you can pass `skipValidation: true` to `flush()`. Use this technique with caution, as it can create invalid entities.

## Built-in Rules

### Required

Joist automatically adds required rules to any column with a not null constraint.

### Cannot Be Updated

If a field can only be set on create (i.e. a parent), you can use `cannotBeUpdated`:

```typescript
// Don't let the parent change
config.addRule(cannotBeUpdated("parent"));
```

Also, you can make this conditional, i.e. on a status:

```typescript
// Only allow updating cost while draft
config.addRule(cannotBeUpdated("cost", e => e.isDraft));
```

