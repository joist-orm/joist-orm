---
title: Json Payloads
sidebar_position: 5
---

If you're using Joist for a REST API, or in React Server components creating props for client-side components, the `toJSON` function an succinctly and type-safely create JSON output. 

### Basic Usage

For example, given a `Author` entity, we can use `toJSON` to create a tree of output:

```typescript
const a = await em.load(Author, "a:1");
console.log(await a.toJSON({
  id,
  books: { id, reviews: { rating } }  
}));
```

This will create the JSON:

```json
{
  "id": "a:1",
  "books": [
    {
      "id": "b:1",
      "reviews": [
        { "rating": 5 },
        { "rating": 4 }
      ]
    }
  ]
}
```

Note how:

* The `books` and `books.reviews` collections are loaded
* Only fields that are explicitly requested are included in the output

### Outputting Lists

If you have an array of entities to output, you can use the static `toJSON` function:

```typescript
import { toJSON } from "joist-orm";
const authors = await em.find(Author, {});
const jsonArray = await toJSON(
  authors,
  { id, books: { id, reviews: { rating } }  
});
```

### Custom Fields

If you need to create JSON fields that are not 1-1 mapped to an entity, you can add async functions to the hint, and they will be called with the entity as the first argument:

```typescript
const a = await em.load(Author, "a:1");
console.log(await a.toJSON({
  books: {
    customTitle: async (b) => {
      return b.title + " by " + (await b.author.get).name;
    }
  }
}));
```
