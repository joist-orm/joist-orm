

Take this example:

```typescript
const authors = await em.find(Author, { id: ["1", "2"] } );
await Promise.all(
  authors.map(async (a) => {
    const p = await em.findOneOrFail(Publisher, { id: a.publisher.id });
    a.firstName = a.firstName + p.name;
    await em.flush();
  }),
);
```

The execution flow, in terms of SQL statements, looks something like:

* `em.find` issues Q1 `SELECT * FROM authors WHERE id IN (1, 2);`
* Q1 returns two authors, `.map` creates lambdas for both
* Lambda 1 issues Q2 `SELECT * FROM publishers WHERE id = 3`, `await`s
* Lambda 2 issues Q3 `SELECT * FROM publishers WHERE id = 4`, `await`s
* Q2 returns, Lambda 1 modifies it's `a`, calls `em.flush`
* Lambda 1's `flush` issues Q4 `UPDATE authors SET first_name = ...`
* Q3 returns, Lambda 2 modifies it's `a`, calls `em.flush`
* Lambda 2's `flush` issues Q4 `UPDATE authors SET first_name = ...`

We've `N+1`'d.

Ways to fix this:

1. We can get fancy and combine Q2 and Q3 into a single query

    I.e. `findOneOrFail` combines any `find`s within the same event loop into something like:

    ```sql
    SELECT "Q1" as query_tag, ... FROM publishers WHERE id = 3`
    UNION ALL
    SELECT "Q2" as query_tag, ... FROM publishers WHERE id = 4`
    ```

    That way both Lambda 1's and Lambda 2's `findOneOrFails` resolve at the same time, which will keep them "in sync", and so then their `em.flush`'s will be combined (which Joist already supports).

    * Pro: Pretty spiffy combination of queries, probably want to do that anyway.
    * Con: Technically if Q2 is really fast and Q3 is really slow, we've coupled the two lambdas. This may be worse than letting them proceed independently, even if it meant the `N+1` behavior from the next `em.flush`?
    * Con: It only works for `await`s that go through Joist, i.e. if Q2 and Q3 were instead wire calls / `await`s to some other library, the uncoordinated behavior comes back.

2. ...leave current behavior?...

