---
title: Json Payloads
sidebar_position: 5
---

If you're using Joist for a REST API, or in React Server components passing props to client-side components, the `toJSON` function can succinctly and type-safely create JSON output. 

:::info

Creating JSON Payloads is a newer feature of Joist, so if you have ideas on how to make it even better, please let us know!

:::

### Basic Usage

For example, given a `Author` entity, we can use `toJSON` to create a tree of output:

```typescript
const a = await em.load(Author, "a:1");
// Describe the shape of your payload
const payload = await a.toJSON({
  id: true,
  books: { id: true, reviews: { rating: true } }
});
// payload will be typed with only the keys you requested
console.log(payload);
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

* The `books` and `books.reviews` collections are automatically loaded
  * If you've already loaded the collections, they won't be reloaded 
  * If you have preloading enabled, this will make 1 SQL call to load all books & book reviews
* Only fields that are explicitly requested are included in the output
* The output is correctly typed, for type-checking against your API response types

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

### Outputting Ids

Often APIs will request the id of an entity, so `toJSON` supports `Id` and `Ids`-based suffixes:

```typescript
const a = await em.load(Author, "a:1");
const payload = await a.toJSON({
  publisherId: true,
  bookIds: true,
});
// returns { publisherId: "p:1", bookIds: ["b:1", "b:2"] }
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
