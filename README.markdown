## joist-ts

An opinionated ORM for TypeScript/node.

### Goals

- Schema-Driven Code Generation (generated classes w/the getter/setter/relation boilerplate)
- Gauranteed N+1 safe (pervasive use of DataLoader)
- Async/Await All Relations (with a synchronous escape hatch)
- Best-in-class Performance (all select/insert/update operations are bulk)
- Fast Unit Tests (for downstream projects, baseline is 10-20ms/test case)
- Unit of Work (navigate between entities as a consistent graph)
- Small & simple codebase (maintainable by a single engineer if needed)

(See [GOALS](./GOALS.markdown) for more in-depth descriptions of each bullet.)

(Also see [SCHEMA](./SCHEMA.markdown) for the assumptions Joist makes about your database schema.)

### Non-Goals

- NoSQL/Mongo/etc. support.
- Anything-but-Postgres support at this point.
- Browser/client-side support

### Building

After checkout:

- Run `make db` to boot up a Docker postgres instance w/the integration test schema.
- Run `npm test` to run the tests.

### Todo

- Lifecycle hooks for validation rules/derived values
- Cascading deletions for parent/child relationships
- `EntityManager.find` (1st pass done)
  - Support non-string types
  - Support user-defined types
- Reorganize into packages and publish to npm
- Add flavor-style entity ids
- Add `EntityManger.findById` / `findByIds`
- Fallback to batch-bump-sequences-on-INSERT for schemas that have cycles
- Support soft deletion?
- Op locks/`version` column?

## History / Inspiration

[Joist](https://github.com/stephenh/joist) is also the name for a Java-based ORM I wrote circa 2008.

joist-ts has many of the same ideas (in terms of opinionated codegen), just applied to TypeScript, and leveraging DataLoader.

The `EntityManager.find` syntax is heavily inspired from [MikroORM](https://mikro-orm.io/), as well as the concept of `EntityManager.populate`.

