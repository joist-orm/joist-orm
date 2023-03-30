---
title: Quick Tour
sidebar_position: 0
---

Joist's docs dive into these features in more detail, but as a quick tldr...

You start by creating/updating your database schema, using `node-pg-migrate` or whatever migration library you like:

```shell
# Apply the latest migrations
npm run migrate
# Now generate the updated domain model
npm run joist-codegen
```

You get clean domain objects created automatically:

```typescript
// src/entities/Author.ts
export class Author extends AuthorCodegen {
  // Where you eventually add custom methods/business logic
}
```

You write validation rules that can be per-field, per-entity or cross-entity, i.e. in `Author.ts`:

```typescript
import { authorConfig as config } from "./entities";

export class Author extends AuthorCodegen {
}

// Anytime an author gets a book added or removed (i.e. via code calling
// `book.author.set(...)`), call this validation rule.
config.addRule("books", (author) => {
  if (author.books.get.length > 10) {
    return "Too many books";
  }
});
```

You can load/save entities in a Unit of Work-style `EntityManager` that will batch save any changes made during the current request (only after running all validation rules & updating any derived values):

```typescript
const a1 = em.load(Author, "a:1");
a1.firstName = "Allen";
a2.lastName = "Zed";
// Runs validation, lifecycle hooks, and issues INSERTs/UPDATEs
await em.flush();
```

You can use GraphQL-style deep preloading to de-`await` business logic:

```typescript
// Use 1 await to preload a tree of data
const loaded = await a1.populate({
  books: "reviews",
  publisher: {},
});

// No more await Promise.all
loaded.books.get.forEach((book) => {
  book.reviews.get.forEach((review) => {
    console.log(review.name);
  });
})
```

