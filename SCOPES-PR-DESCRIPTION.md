# Add Scope Queries

## Summary

Adds Rails-style, typed scope queries for reusable Joist `em.find` filters:

```ts
await Author.adult.popular.find(em);
await Author.named("a").adult.find(em);
await Author.adult.where({ firstName: "a1" }).findOne(em);
```

Scopes are static entity properties, but execution still requires an explicit `EntityManager` via terminal methods like `.find(em)`, `.findOne(em)`, `.findCount(em)`, and `.findIds(em)`.

## Implementation

- Adds `newScopeFn`, `Scope`, `ScopeFn`, and `ScopeCondition` to `joist-core` and re-exports them through `joist-orm`.
- Represents scopes as immutable ordered operations that compile to Joist's existing `FilterAndSettings<T>` / `em.find` path.
- Supports object filters, alias-condition filters, parameterized scopes with `scope.fn`, named-scope chaining, and builder chaining with `.where`, `.orderBy`, `.limit`, `.offset`, and `.softDeletes`.
- Preserves scope conditions when terminal `.find(em, opts)` calls pass additional `conditions`.
- Avoids object-spread last-write-wins for repeated root-level filter fields by moving alias-compatible root filters into ANDed conditions.
- Generates per-entity `authorScope` function constants in each `<Entity>Codegen.ts`, mirroring existing `<entity>Config` constants.
- Generates `<Entity>Scopes` and `<Entity>Scope` types from a syntax-only codegen pre-scan of user-owned entity files.
- Regenerates test fixture codegen so every entity has an empty or populated `<Entity>Scopes` interface and `<Entity>Scope` alias.

## Example

```ts
import {
  AuthorCodegen,
  authorConfig as config,
  authorScope as scope,
  type AuthorScope,
} from "./entities";

export class Author extends AuthorCodegen {
  static adult: AuthorScope = scope({ age: { gte: 18 } });
  static popular: AuthorScope = scope((a) => a.isPopular.eq(true));
  static named: (prefix: string) => AuthorScope = scope.fn((prefix) => (a) => a.firstName.like(`${prefix}%`));
}
```

After codegen refreshes `AuthorScopes`, those declarations become chainable:

```ts
await Author.adult.popular.find(em);
await Author.named("a").adult.find(em);
```

## Tests

- Adds `packages/tests/integration/src/EntityManager.scopes.test.ts` for runtime behavior and compile-time type assertions.
- Covers object-form scopes, alias-condition scopes, parameterized scopes, named-scope chaining, static scopes composed from other scopes, builder methods, terminal methods, populate typing, immutability, unknown-scope runtime errors, and `toFindArgs` output.

## Verification

Verified:

```bash
cd packages/tests/integration && yarn jest -- src/EntityManager.scopes.test.ts
cd docs && yarn build
yarn build
```

## Review Notes

- The codegen scanner is intentionally syntax-only: scope declarations must be static properties with an explicit `<Entity>Scope` type, or a function type returning `<Entity>Scope`, and an initializer rooted at `scope` or the entity class.
- Parameterized scopes should use static properties, not static methods, so codegen can discover them.
- Collection-bound scopes and implicit ambient-EM execution are intentionally out of scope for this first implementation.
- For repeated complex nested relation filters, prefer combining that relation filter in a single scope; root-level repeated fields can also use alias-condition scopes for explicit AND semantics.

## Non-Scope Diff Notes

The `main..@` diff also currently contains scope design markdown files, an added batched-paginated-find blog post, and an unrelated GraphQL resolver hint test/behavior change. Consider splitting those out if this PR should stay scope-only.
