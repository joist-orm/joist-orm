# Joist ORM - Claude Development Notes

## Running Tests

To run tests in this project:

1. First navigate to the integration tests directory:
   ```bash
   cd packages/tests/integration/
   ```

2. Then run all tests using yarn:
   ```bash
   yarn test-stock
   ```

3. To run a specific test file:
   ```bash
   yarn jest -- [test-file-pattern]
   ```

## Project Structure

- `/packages/orm/` - Core ORM implementation
- `/packages/tests/integration/` - Integration tests
- `/packages/graphql-codegen/` - GraphQL code generation
- `/docs/` - Documentation site

## Debugging

- `packages/tests/integration/src/testEm.ts` has a `console.log(sql)` in `recordQuery` that can be uncommented to log all SQL queries during tests
- Use `PLUGINS=` (empty) to disable the join-preloading plugin when running tests

## Important Notes

- Always use `yarn test` instead of `npm test`
- Tests should be run from the `packages/tests/integration/` directory
- The project uses Jest for testing
- Do not use extraneous local variables
- Do not use boilerplate comments that describe "what" the code is doing, only use comments to explain "why" or rationale
- Test assertions should use `toMatchEntity` as much as possible
- Never use `expect.objectContaining`, `toContain`, or `not.toContain`; use `toMatchObject` instead
- For DB row assertions, use `toMatchObject` on the whole array instead of per-row `length` checks, e.g. `expect(rows).toMatchObject([{ publisher_id: null }, { publisher_id: 1 }])`
- Use tagged ids for `em.load`/`em.loadAll` calls, e.g. `em.load(Author, "a:1")` not `em.load(Author, "1")`
- Put helper/private functions at the bottom of the file, exported/public functions at the top
