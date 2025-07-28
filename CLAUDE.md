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

## Important Notes

- Always use `yarn test` instead of `npm test`
- Tests should be run from the `packages/tests/integration/` directory
- The project uses Jest for testing
- Do not use extraneous local variables
- Do not use boilerplate comments that describe "what" the code is doing, only use comments to explain "why" or rationale
- Test assertions should use `toMatchEntity` as much as possible
