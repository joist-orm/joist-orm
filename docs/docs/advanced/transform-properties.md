---
title: Properties Transform
sidebar_position: 35
---

A key feature of Joist is defining custom properties on your domain model, i.e. `hasOneThrough`, `hasManyThrough`, `hasAsyncProperty`, `hasReactiveField`, etc.

While these properties are powerful, Joist's current API involves defining them as properties directly on each instance of an entity, i.e.:

```ts
export class Author extends AuthorCodegen {
  readonly reviews: Collection<Author, BookReview> = hasManyThrough((a) => a.books.reviews);
}
```

This means that if you load 1,000 `Author` rows from the database, there will be 1,000 `hasManyThrough` relations initialized, even if this particular endpoint/codepath doesn't end up accessing them.

In the majority of scenarios, this is fine, but when loading ~1,000s of entities, it can become a performance issue.

To address this, Joist provides a [ts-patch](https://github.com/nonara/ts-patch) transformer that will rewrite the fields into lazy getters on the `Author` prototype.

To enable this, add the following to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [
      { "transform": "joist-transform-properties", "type": "raw" }
    ]
  }
}
```

And then compile your production code with `tspc` instead of the raw `tsc` command.
