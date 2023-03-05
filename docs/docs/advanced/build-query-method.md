### `#loadFromQuery`

Load multiple instances of a given entity from a Knex QueryBuilder.

```ts
const em = newEntityManager();
const authors = await em.loadFromQuery(Author, knex.select("*").from("authors"));
```
