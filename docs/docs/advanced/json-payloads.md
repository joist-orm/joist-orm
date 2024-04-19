---
title: Json Payloads
sidebar_position: 2
---

If you're using Joist for a REST API, or in React Server components creating props for client-side components, Joist has a `toJSON` function to help succinctly and type-safely create JSON output. 

### Basic Usage

For example, given a `Author` entity, we can use `toJSON` to create a tree of output:

```typescript
const a = await em.load(Author, "a:1");
console.log(await toJSON(a, {
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

### Custom Fields


