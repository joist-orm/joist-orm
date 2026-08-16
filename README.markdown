[![npm](https://img.shields.io/npm/v/joist-orm)](https://www.npmjs.com/package/joist-orm)
[![npm next](https://img.shields.io/npm/v/joist-orm/next)](https://www.npmjs.com/package/joist-orm)
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
- Run `yarn build` to compile all packages
- Run `yarn db` to boot up a Docker postgres instance w/the integration test schema.
- Run `yarn test` to run the tests.
- Prior to committing your changes, run `yarn workspaces run format`

The build runs two complementary TypeScript checks after `tsdown` emits the package artifacts:

- `yarn typecheck:packages` checks each public package's source with its ESM-first NodeNext configuration. It catches source errors that `tsdown`'s isolated transforms do not report and runs after the build so workspace package imports can resolve the emitted declarations.
- `yarn typecheck:consumers` checks the unit-test project and every `joist-tests-*` workspace against the emitted package exports. This covers the ESM and CommonJS declaration paths, generated module augmentations, and other issues that only appear when Joist is consumed as a package.

`yarn start` runs `tsdown` and TypeScript in watch mode as separate mprocs processes. `build:watch` updates the ESM and CommonJS artifacts, while `typecheck:watch` incrementally checks the complete package and consumer project graph. The typecheck watcher emits declarations because TypeScript project-reference builds cannot use `--noEmit`; `build:watch` does not clean them while both processes are running, and the next normal build removes them.

### License

MIT
