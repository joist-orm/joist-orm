---
title: Validation Rules
---

Entities can have validation rules added that will be run during `EntityManager.flush()`:

```typescript
class Author extends AuthorCodegen {
  constructor(em: EntityManager, opts: AuthorOpts) {
    super(em, opts);
  })
}

authorConfig.addRule((author) => {
  if (author.firstName && author.firstName === author.lastName) {
    return "firstName and lastName must be different";
  }
});

// Rules can be async
authorConfig.addRule(async (author) => {
  const books = await authorthis.books.load();
  // ...
});
```

If any validation rule returns a non-`undefined` string, `flush()` will throw a `ValidationErrors` error.

If you would like to skip validation rules, you can pass `skipValidation: true` to `flush()`. Use this technique with caution, as it can create invalid entities.
