
# joist-knex

`joist-knex` provides a `buildQuery` function that takes `em.find`-style input and returns a Knex `QueryBuilder`.

This is useful for creating the "last 5%" of queries that need SQL features that `em.find` doesn't support, i.e. primarily aggregation, but also more complicated joins, query conditions, etc.

Knex itself is well-suited to this task, because it has structured methods like `clearOrder`, `select`, etc. to help munge the initial `buildQuery`-created query into the custom query, without tedious string parsing.
