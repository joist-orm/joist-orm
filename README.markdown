[![npm](https://img.shields.io/npm/v/joist-orm)](https://www.npmjs.com/package/joist-orm)
[![CircleCI](https://circleci.com/gh/joist-orm/joist-orm.svg?style=svg)](https://circleci.com/gh/joist-orm/joist-orm)

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

For contributing to Joist itself, after checkout:

- Run `yarn install`
- Run `yarn build` or `yarn build -w` to compile all packages
- Run `yarn db` to boot up a Docker postgres instance w/the integration test schema.
- Run `yarn test` to run the tests.
- Prior to committing your changes, run `yarn workspaces run format`

### License

MIT
