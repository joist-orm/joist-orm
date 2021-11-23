---
title: Automatic Null Conversion
sidebar_position: 3
---

Joist prefers to use `undefined` where ever possible, i.e. columns that are `null` in the database are returned as `undefined`.

```typescript
// Given `authors` row id=1 has last_name=null
const author = em.load(Author, "1");
// Then the domain object treats it as `undefined`
expect(author.lastName).toBeUndefined();
```

And the `setPartial` method allows setting `lastName` as `null`:

```typescript
const newLastName: string | undefined | null = null;
author.setPartial({ lastName: newLastName });
// `lastName` is converted to `undefined`
expect(author.lastName).toBeUndefined();
```

And when saved to the database, `undefined`s are converted back into `null`s.

(Note that the `author.lastName` setter does not accept `null` because in TypeScript the types of getters and setters must be exactly the same, and so Joist can't "allow setting `null`" while "enforcing `null` will not be returned". Helper methods like `Entity.set` do not have this restriction, and so can accept `null`s and do the `null` to `undefined` conversion for callers.)
