
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

(See [goals](./docs/goals.markdown) for more in-depth descriptions of each bullet and [misc features](./docs/misc-features.markdown) for "kinda like docs" highlights of things.)

(Also see [Schema Assumptions](./docs/schema-assumptions.markdown) for the assumptions Joist makes about your database schema.)

### Non-Goals

- NoSQL/Mongo/etc. support.
- Anything-but-Postgres support at this point.
- Browser/client-side support

### Status

Joist is currently in beta: all of the features work, are "past proof of concept" stage, and are well-covered by tests.

Per the `0.1.x` versioning, breaking API changes should be expected for awhile.

### Install

See [Getting Started](./docs/getting-started.markdown) and the [integration-tests](./packages/integration-tests), which is essentially a sample app with a domain model of `Author`, `Book`, etc. entities.

### Building

After checkout:

- Run `yarn install`
- Run `yarn build`
- `cd packages/integration-tests`
- Run `make db` to boot up a Docker postgres instance w/the integration test schema.
- Run `yarn test` to run the tests.

### Todo

In general priority/itch order:
 
- Open source a `joist-graphql-utils` with the `entityResolver` logic in it
- Fix reactive rules not catching "middle-references" changing (fixed?)
- Support `documentId`-style props in unsafe methods
- Optionally move `begin` to the start of Unit of Work
- `readonly asyncValue` that integrations into `populate`
- Codegen'd test builders 
- Add Collection.load(loadHint) (see branch, potential tsc 3.9 issue)
- Support user-defined types
- LargeCollection support
  - I.e. `joist-config.json` entry to mark (say) `publisher.authors` as "too big to never read at once" and use a different/restricted API, i.e. forced paging
- JSON support, i.e. `toJSON`
- Cascading deletions for parent/child relationships
- First-class support for soft deletion?
- Op locks/`version` column?
- An in-memory backend

### History / Inspiration

[Joist](https://github.com/stephenh/joist) is also the name for a Java-based ORM I wrote circa 2008.

joist-ts has many of the same ideas (in terms of opinionated codegen), just applied to TypeScript, and leveraging DataLoader.

The `EntityManager.find` syntax is heavily inspired from [MikroORM](https://mikro-orm.io/), as well as the concept of `EntityManager.populate`.

### License

MIT


