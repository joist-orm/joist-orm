# Testing

- Use integration tests as the primary coverage: real PostgreSQL schema -> real introspection -> real codegen -> public ORM behavior.
- Do not add isolated-layer generator tests built from mocked metadata, fake tables, or manually hand-built descriptors. Mock metadata is not a replacement for real domain coverage.
- Reuse existing domain models and migrations. Add only the minimal real fields needed for the behavior under test.
- Assert runtime behavior and types through generated entities.
- Use inline snapshots only. Do not create `__snapshots__` files or directories.
