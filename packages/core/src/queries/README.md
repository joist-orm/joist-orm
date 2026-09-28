# Query implementation

- `sql/` owns the SQL-shaped `em.query` and `em.execute` APIs: tables, expressions, statement compilation, and result decoding.
- `find/` owns entity-shaped filters, domain aliases, scopes, find parsing, join optimization, and SQL rendering.
- Modules directly under `queries/` hold shared condition types, pruning, rendering, value-filter conversion, and entity-selection rules.

The two APIs retain their own query representations. Finds use `ParsedFindQuery`, which plugins, preloading, and batching can modify. SQL-shaped queries compile expression handles and scopes into a `Plan`.

The shared condition representation includes find-style EXISTS conditions, whose subqueries are typed as `ParsedFindQuery`. This is a type-only dependency; shared condition rendering receives a subquery renderer from the caller.

Find batching and execution adapters live in `src/dataloaders/`. EntityManager coordinates execution, permissions, hydration, and plugins. Database access and entity writes live in `drivers/`. Public exports are declared in `src/index.ts`; implementation modules import each other directly.
