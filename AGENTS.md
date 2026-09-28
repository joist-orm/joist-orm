# Testing

- Use integration tests as the primary coverage: real PostgreSQL schema -> real introspection -> real codegen -> public ORM behavior.
- Do not add isolated-layer generator tests built from mocked metadata, fake tables, or manually hand-built descriptors. Mock metadata is not a replacement for real domain coverage.
  - The one exception is asserting that codegen *rejects* an invalid `joist-config.json`, which no integration test can reach, since the fixture would have to be broken for the whole package. Keep those beside the validation they cover, limited to the rejection itself and its boundary; anything the validation accepts belongs in the fixture.
- Reuse existing domain models and migrations. Add only the minimal real fields needed for the behavior under test.
- Assert runtime behavior and types through generated entities.
- Use inline snapshots only. Do not create `__snapshots__` files or directories.
- Structure every new or modified test with domain-specific `// Given`, `// When`, and `// Then` comments: setup, action under test, and expected behavior.
- Use `// And` before each additional distinct setup condition or mutation. For tests with multiple action/assertion phases, repeat `// When` and `// Then` for each phase.
- Comments must describe domain behavior, not mechanics such as "run the query" or "check the result".
