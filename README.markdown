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

Joist is currently used in production at [Homebound](https://www.homebound.com/). All of the features should generally be solid/working, with a caveat that fill a bug report if you run into anything.

### Install

See [Getting Started](./docs/getting-started.markdown) and the [integration-tests](./packages/integration-tests), which is essentially a sample app with a domain model of `Author`, `Book`, etc. entities.

### Documentation

Lack of documentation is currently Joist's biggest pain point.

The current "best" documentation sources are:

* [Misc Features](./docs/misc-features.markdown),
* [Getting Started](./docs/getting-started.markdown), and
* the [integration-tests](./packages/integration-tests) setup for copy/pasting a docker-compose setup

### Building Joist

After checkout:

- Run `yarn install`
- Run `yarn build`
- `cd packages/integration-tests`
- Run `make db` to boot up a Docker postgres instance w/the integration test schema.
- Run `yarn test` to run the tests.
- Prior to committing your changes, please run `yarn workspaces run format`

### Todo

In general priority/itch order:

- Open source `joist-graphql-utils` with the `entityResolver` logic in it
- Fix reactive rules not catching "middle-references" changing (fixed?)
- Optionally move `begin` to the start of Unit of Work
- `readonly asyncValue` that integrations into `populate`
- Add Collection.load(loadHint) (see branch, potential tsc 3.9 issue)
- Support user-defined types
  - Hack day: `CalendarInterval` that matches `*_start_date`, `*_end_date`, `_duration_in_days`
    - Would need to be able to add to `Opts`, `Filters`, `derivedValue`?
- LargeCollection support
  - I.e. `joist-config.json` entry to mark (say) `publisher.authors` as "too big to never read at once" and use a different/restricted API, i.e. forced paging
- JSON support, i.e. `toJSON`
- First-class support for soft deletion?
- Op locks/`version` column?
- An in-memory backend
- `hasOneThrough` that can be used as `find`/SQL filters
  - Need to declare in codegen to a) add to FilterType + b) verify once traverses relations

### History / Inspiration

[Joist](https://github.com/stephenh/joist) is also the name for a Java-based ORM I wrote circa 2008.

joist-ts has many of the same ideas (in terms of opinionated codegen), just applied to TypeScript, and leveraging DataLoader.

The `EntityManager.find` syntax is heavily inspired from [MikroORM](https://mikro-orm.io/), as well as the concept of `EntityManager.populate`.

### License

MIT
