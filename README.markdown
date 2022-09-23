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
- Run `make db` to boot up a Docker postgres instance w/the integration test schema.
- `cd packages/integration-tests`
- Run `yarn test` to run the tests.
- Prior to committing your changes, run `yarn workspaces run format`

### License

MIT
