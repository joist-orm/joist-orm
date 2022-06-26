---
title: Lifecycle Hooks
position: 1
---

There are two lifecycle hooks: `beforeFlush` and `afterCommit`:

```typescript
class Author extends AuthorCodegen {
  constructor(em: EntityManager, opts: AuthorOpts) {
    super(em, opts);
  }
}

authorConfig.beforeFlush(async () => ...);

authorConfig.afterCommit(async () => ...);
```
