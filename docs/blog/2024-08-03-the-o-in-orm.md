---
title: The "O" in ORM
slug: the-o-in-orm
authors:
  - name: Stephen Haberman
    url: https://github.com/stephenh
    image_url: https://github.com/stephenh.png
tags: []
---

In the ORM world, there are generally two flavors of ORMs these days:

1. Query-builder ORMs
2. Entity-based ORMs

Query-builders ORMs are exemplified by Knex, Drizzle, and Prisma, where your code generally hand-creates every individual query using a fluent API, and then execute it to get back a result set:

```typescript
// example with knex
const authors = await knex("authors").where("firstName", "Stephen");

// example with drizzle
const result = await db.query.books.findMany({
  with: { authors: true },
});
```
