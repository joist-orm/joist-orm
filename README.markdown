![npm](https://img.shields.io/npm/v/joist-orm)
[![CircleCI](https://circleci.com/gh/stephenh/joist-ts.svg?style=svg)](https://circleci.com/gh/stephenh/joist-ts)

## Joist

An opinionated ORM for TypeScript/node/postgres.

### Goals

- Schema-driven code generation (continually-generated classes w/the getter/setter/relation boilerplate)
- Guaranteed N+1 safe (pervasive use of Facebook's [dataloader](https://github.com/graphql/dataloader)
- All relations are async/await (with an ergonomic, type-safe escape hatch)
- Great performance (all `SELECT`/`INSERT`/`UPDATE` operations are bulk)
- Fast tests (for downstream projects, baseline is 10-20ms/test case)
- Unit of Work (navigate between entities as a consistent graph)

### Documentation

See [joist-orm.io](https://joist-orm.io) for documentation.

### Building Joist

After checkout:

- Run `yarn install`
- Run `yarn build`
- `cd packages/integration-tests`
- Run `make db` to boot up a Docker postgres instance w/the integration test schema.
- Run `yarn test` to run the tests.
- Prior to committing your changes, run `yarn workspaces run format`

### Todo

In general priority/itch order:

- Integrate `PotentialOperation` ideas, i.e. a `Book.canBeDeleted` operation that can also be used as a validation rule
  - Wrinkle is that, when ran as a validation rule, it needs the original / pre-flush view of "what was this allowed before the user changed it"
  - Or instead of a validation rule, do we invoke the potential operation inline while the setter/mutation is running?
- Open source `joist-graphql-utils` with the `entityResolver` logic in it
- Fix reactive rules not catching "middle-references" changing (fixed?)
  - Use case: books within an author can't have the same title, but no author fields are read, so author changing shouldn't re-validate their books
- Optionally move `begin` to the start of Unit of Work
- `readonly asyncValue` that integrations into `populate`
- Add Collection.load(loadHint) (see `reference-load-with-populate-hint` branch, potential tsc 3.9 issue)
- Support user-defined types
  - Hack day: `CalendarInterval` that matches `*_start_date`, `*_end_date`, `_duration_in_days`
    - Would need to be able to add to `Opts`, `Filters`, `derivedValue`?
- LargeCollection support
  - I.e. `joist-config.json` entry to mark (say) `publisher.authors` as "too big to never read at once" and use a different/restricted API, i.e. forced paging
- First-class support for soft deletion
- `hasOneThrough` that can be used as `find`/SQL filters
  - Need to declare in codegen to a) add to FilterType + b) verify once traverses relations

### License

MIT
