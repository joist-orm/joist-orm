
<img src="https://img.shields.io/npm/v/joist-orm" />

## joist-ts

An opinionated ORM for TypeScript/node.

### Goals

- Schema-Driven Code Generation (continually-generated classes w/the getter/setter/relation boilerplate)
- Gauranteed N+1 safe (pervasive use of DataLoader)
- All Relations are Async/Await (with a type-safe escape hatch)
- Best-in-class Performance (all `SELECT`/`INSERT`/`UPDATE` operations are bulk)
- Fast Unit Tests (for downstream projects, baseline is 10-20ms/test case)
- Unit of Work (navigate between entities as a consistent graph)
- Small & simple codebase (maintainable by a single engineer if needed)

(See [GOALS](./GOALS.markdown) for more in-depth descriptions of each bullet.)

(Also see [SCHEMA](./SCHEMA.markdown) for the assumptions Joist makes about your database schema.)

### Non-Goals

- NoSQL/Mongo/etc. support.
- Anything-but-Postgres support at this point.
- Browser/client-side support

### Status

Joist is currently in beta: all of the features work, are "past proof of concept" stage, and are well-covered by tests.

Per the `0.1.x` versioning, breaking API changes should be expected for awhile.

### Install

Requires ES2019/[Node v12.4.0](https://node.green/#ES2019) for `Object.fromEntries`, `Array.flatMap`, etc.

### Building

After checkout:

- Run `yarn install`
- Run `yarn build`
- `cd packages/integration-tests`
- Run `make db` to boot up a Docker postgres instance w/the integration test schema.
- Run `yarn test` to run the tests.

### Todo

- Derived values
- Use load hint-style syntax to declare validation rule sub-graph
- JSON support, i.e. [upsertGraph](https://vincit.github.io/objection.js/guide/query-examples.html#graph-inserts)/`toJSON`
- Cascading deletions for parent/child relationships
- Codegen'd test builders 
- Support user-defined types
- First-class support for soft deletion?
- LargeCollection support
- Op locks/`version` column?
- An in-memory backend

## History / Inspiration

[Joist](https://github.com/stephenh/joist) is also the name for a Java-based ORM I wrote circa 2008.

joist-ts has many of the same ideas (in terms of opinionated codegen), just applied to TypeScript, and leveraging DataLoader.

The `EntityManager.find` syntax is heavily inspired from [MikroORM](https://mikro-orm.io/), as well as the concept of `EntityManager.populate`.

## License

MIT

