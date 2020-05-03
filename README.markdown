
![npm](https://img.shields.io/npm/v/joist-orm)
[![CircleCI](https://circleci.com/gh/stephenh/joist-ts.svg?style=svg)](https://circleci.com/gh/stephenh/joist-ts)

## joist-ts

An opinionated ORM for TypeScript/node.

### Goals

- Schema-Driven Code Generation (continually-generated classes w/the getter/setter/relation boilerplate)
- Guaranteed N+1 safe (pervasive use of DataLoader)
- All Relations are Async/Await (with a type-safe escape hatch)
- Best-in-class Performance (all `SELECT`/`INSERT`/`UPDATE` operations are bulk)
- Fast Unit Tests (for downstream projects, baseline is 10-20ms/test case)
- Unit of Work (navigate between entities as a consistent graph)
- Small & simple codebase (maintainable by a single engineer if needed)

(See [goals](./docs/goals.markdown) for more in-depth descriptions of each bullet.)

(Also see [Schema Assumptions](./docs/schema-assumptions.markdown) for the assumptions Joist makes about your database schema.)

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

In general priority/itch order:
 
- Validation rules
  - Codegen db constraints like required, length check (probably not unique constraints)
  - Add lambdas at a class-level? `addRule(() => ...)` in the constructor?
  - (Later) Use load hint-style syntax to declare "reactive" validation rule sub-graphs
- Optionally move `begin` to the start of Unit of Work
- Codegen'd test builders 
- Lifecycle hooks
  - Rename `onSave` --> `preFlush` / `postFlush`
  - See [Gusto](https://engineering.gusto.com/the-rails-callbacks-best-practices-used-at-gusto/) posts but using WAL/EventBridge events are best-practice way of doing this anyway
- Add example of "lastName cannot be changed" that uses 1) validation rule, 2) isNew, and 3) type-safe changed
- Add Collection.load(loadHint)
- Derived values
  - Derived primitives is implemented
- Support user-defined types
- LargeCollection support
  - I.e. `joist-config.json` entry to mark (say) `publisher.authors` as "too big to never read at once" and use a different/restricted API, i.e. forced paging
- JSON support, i.e. [upsertGraph](https://vincit.github.io/objection.js/guide/query-examples.html#graph-inserts)/`toJSON`
- Cascading deletions for parent/child relationships
- First-class support for soft deletion?
- Op locks/`version` column?
- An in-memory backend

## History / Inspiration

[Joist](https://github.com/stephenh/joist) is also the name for a Java-based ORM I wrote circa 2008.

joist-ts has many of the same ideas (in terms of opinionated codegen), just applied to TypeScript, and leveraging DataLoader.

The `EntityManager.find` syntax is heavily inspired from [MikroORM](https://mikro-orm.io/), as well as the concept of `EntityManager.populate`.

## License

MIT


