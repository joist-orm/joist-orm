# Feedback on `SCOPES-DESIGN.md`

## Summary

`SCOPES-DESIGN.md` is more ambitious than `SCOPES-DESIGN-GPT.md` and has several strong ideas, especially:

- using `.find(em)` as the primary terminal API
- treating scopes as immutable ordered ops
- supporting parameterized scopes
- explicitly identifying the recursive `Scope<T, typeof Entity>` typing risk
- using alias-condition fragments to preserve same-field AND semantics

The main concern is that the alternate design optimizes for avoiding a hand-written scope-name interface by using `typeof Author` introspection and `Proxy` runtime lookup. That could be elegant if it works, but it is also the highest-risk part of the proposal. It needs an isolated TypeScript spike before any runtime implementation.

My design is more conservative: it assumes generated/declared scope maps are the most reliable typing model and treats `config.scope(...)` as the preferred long-term declaration API. The alternate design is more ergonomic for hand-written static scopes if the recursive type holds.

## Highest-Risk Findings

### 1. Recursive `Scope<T, typeof Author>` Typing May Not Be Viable

`SCOPES-DESIGN.md` depends on this shape:

```ts
export type Scope<T extends Entity, C> = ScopeQuery<T> & {
  [K in ScopeNames<C>]: C[K] extends (...a: infer A) => any
    ? (...a: A) => Scope<T, C>
    : Scope<T, C>;
};
```

and static declarations like:

```ts
static adult: AuthorScope = scope(Author, (a) => a.age.gte(18));
```

This is clever, but it risks one or more TypeScript failures:

- `ts2589` excessive recursive instantiation
- unstable IntelliSense/performance on real generated entity classes
- recursive static-side inference failures beyond the explicitly mentioned `ts7022`
- mapped type pollution from inherited static members or generated static metadata
- parameterized scope statics being misclassified as generic functions returning scope-like values

Recommendation:

Prototype this first in `packages/tests/integration` or a focused type-test fixture before building runtime. The spike should use a real generated entity class shape, not a toy class, because Joist generated statics and inheritance may materially affect `keyof typeof Author`.

Acceptance criteria:

- `Author.adult.popular.where(...).find(em)` type-checks.
- `Author.named("a").adult.find(em)` type-checks.
- `Author.adult.named("a").find(em)` type-checks.
- `Author.adult.bogus` fails.
- invalid `.where` fields fail.
- invalid `.orderBy` fields fail.
- `yarn build` completes without `ts2589` or large type-check regressions.

### 2. Alias-Only Same-Field Safety Is Too Easy To Misuse

The alternate design says same-field stacking is only safe through the alias callback form, while object `where` fragments are merged with `Object.assign` and last key wins.

That is not acceptable as the default behavior for a Rails-style scope system. Users will naturally write:

```ts
static adult = scope(Author, { age: { gte: 18 } });
await Author.adult.where({ age: { lt: 65 } }).find(em);
```

If this silently drops one predicate, it violates the core "scopes stack with AND semantics" promise.

Recommendation:

- Do not rely on documentation to steer users to alias callbacks for same-field composition.
- Either preserve object `where` fragments separately until query parsing, or detect duplicate field paths and convert them into AND-ed conditions.
- If neither is feasible in v1, throw on duplicate object-where keys instead of silently last-winning.

Minimum tests:

- `{ age: { gte: 18 } }` + `{ age: { lt: 65 } }` returns only ages in `[18, 65)`.
- `{ age: 18 }` + `{ age: 20 }` either returns none via AND semantics or throws a documented duplicate-filter error. It must not silently become `{ age: 20 }`.
- nested duplicate relation filters are covered, e.g. `{ publisher: { name: "a" } }` + `{ publisher: { country: "US" } }`.

### 3. `ScopeQuery` Methods Returning `this` May Be Unsound With Proxies And Parameterized Accessors

`SCOPES-DESIGN.md` uses `this` return types so named accessors survive chains:

```ts
where(where: FilterOf<T>): this;
orderBy(orderBy: OrderOf<T> | OrderOf<T>[]): this;
```

This looks ergonomic, but the implementation returns new proxied `ScopeImpl` instances, not the same object or subclass. `this` types can become overly optimistic and may preserve accidental extra properties from narrowed values.

Recommendation:

Prefer explicit return types:

```ts
where(where: FilterOf<T>): Scope<T, C>;
```

or use the generated/declared map model from `SCOPES-DESIGN-GPT.md`:

```ts
where(where: FilterWithAlias<T>): Scope<T, Scopes> & Scopes;
```

Test cases:

- chained builders retain named accessors after each builder call
- parameterized accessors retain builder methods after invocation
- `const s = Author.adult.where(...); s.named("a").popular.find(em)` type-checks

### 4. Runtime `Proxy` Lookup Makes Invalid Scope Names A Runtime Concern

The alternate design uses a `Proxy` where unknown string keys are treated as sibling scopes. TypeScript may reject invalid names if the recursive mapped type works, but runtime behavior still matters for dynamic access, JS users, and accidental `any`.

Risks:

- typos through `any` become confusing runtime lookups
- method/scope name collisions are ambiguous
- static functions that are not scopes might be called or inspected incorrectly
- parameterized scope functions and terminal methods must be carefully distinguished

Recommendation:

- Maintain a runtime registry of known scope names even if the class static side is the type-level source.
- Reject scope names that collide with builder/terminal names: `where`, `orderBy`, `limit`, `offset`, `find`, `findOne`, `findCount`, `findIds`, `toFindArgs`, `and`, `or`, `then`.
- Never expose a `then` property, or scopes can become accidental thenables.

Test cases:

- `Author.where` cannot be registered as a scope.
- `Author.then` cannot be registered as a scope.
- `Author.adult.bogus` fails at type level and throws a useful runtime error if reached through `any`.

### 5. The `MaybeAbstractEntityConstructor` Generic May Not Preserve Static Metadata Needed By `scope(Author, ...)`

The alternate design's `scope` overloads use:

```ts
export function scope<C extends MaybeAbstractEntityConstructor<any>>(...)
```

But Joist's `MaybeAbstractEntityConstructor<T>` is only an abstract constructor signature and does not expose static `metadata`, `tagName`, or `getInstanceData`. The runtime implementation needs metadata. The type-level implementation needs `keyof C` over the actual static class. Constraining to ~~~~`MaybeAbstractEntityConstructor<any>` may erase or fail to require the statics the implementation depends on.

Recommendation:

- Use a constructor type that preserves the concrete static side and requires metadata where needed.
- Consider `C extends EntityConstructor<InstanceType<C>>` for concrete entities, or define a new `ScopedEntityConstructor<T>` with the required static fields.
- Test STI/abstract entities separately if scopes are intended there.

## API Ergonomics Comparison

### Where `SCOPES-DESIGN.md` Is Better

The alternate design has better ergonomics for hand-authored static scopes if the typing spike passes:

```ts
static adult: AuthorScope = scope(Author, (a) => a.age.gte(18));
```

Compared with my conservative fallback:

```ts
export interface AuthorScopes {
  adult: AuthorScope;
}
export type AuthorScope = Scope<Author, AuthorScopes> & AuthorScopes;
```

The alternate avoids maintaining scope names in a separate interface. That is a real win.

### Where `SCOPES-DESIGN-GPT.md` Is Safer

My design is more robust for typing because it uses explicit/generated scope maps:

```ts
export interface UserScopes {
  active: UserScope;
  adult: UserScope;
}
```

This is less magical and more likely to survive Joist's generated inheritance/type-map complexity. It also aligns better with `config.scope(...)`, which is the most Joist-native declaration style.

### Recommended Combined Direction

Use a staged decision:

1. Spike the alternate design's recursive `Scope<T, typeof Entity>` typing.
2. If it passes on real generated entities, prefer it for `static active: AuthorScope = scope(Author, ...)` because it avoids a names interface.
3. Keep the explicit/generated `AuthorScopes` map as the fallback for `config.scope(...)`, association scopes, and any entities that trigger recursive type limits.
4. Do not implement `config.scope(...)` as the first slice unless scope-name discovery/type declaration is solved.

## Collection Scope Feedback

`SCOPES-DESIGN.md` covers `author.books.published`, but it does not include the `and` namespace variation. `SCOPES-DESIGN-GPT.md` includes both:

```ts
await a1.books.published.find();
await a1.books.and.published.find();
```

Recommendation:

- Prefer `a1.books.and.published` for v1 if collection method collisions are likely.
- Consider direct `a1.books.published` only after auditing collection method names and generated relation APIs.
- Generate only `{ and: BookScopes }` on collections initially to keep the collection surface small.

Collection tests to add:

- o2m: `author.books.and.published.find()` applies both relation predicate and scope.
- m2m: relation predicate uses the correct join-side filter.
- unloaded collection does not load the entire collection before filtering.
- loaded collection behavior is explicitly tested: either still queries DB or intentionally filters in memory.
- unsaved owner throws a clear error.
- owner from one `EntityManager` cannot be used with a different `EntityManager` if `.find(em)` is allowed on bound scopes.

## Parameterized Scope Feedback

The alternate design includes parameterized scopes, which my design only mentioned as future/possible. This should be part of the design, but probably not part of the first runtime slice unless the type spike proves it works.

Recommended syntax:

```ts
static named: (prefix: string) => AuthorScope = scope(Author, function named(prefix: string) {
  return function namedWhere(a) {
    return a.firstName.ilike(`${prefix}%`);
  };
});
```

Use named functions in real code to follow repo conventions.

Tests:

- `Author.named("a").find(em)` executes correctly.
- `Author.adult.named("a").find(em)` composes correctly.
- `Author.named("a").adult.find(em)` composes correctly.
- `Author.named(1)` fails typechecking.
- parameterized scope references inside another scope remain lazy and receive the correct args.

## Terminal Method Feedback

`SCOPES-DESIGN.md` proposes `findOne`, `findOneOrFail`, `findCount`, and `findIds`. This is a good API direction, but it increases the first implementation surface.

Recommendation:

- Implement `.find(em)` first.
- Add `.findCount(em)` and `.findIds(em)` only after the scope-to-find-args compiler is stable.
- Add `.findOne` only if its semantics match Joist's existing single-row helpers and duplicate-row behavior.

Tests:

- terminal methods preserve populate typing where applicable.
- `findCount` includes both `where` and `conditions`.
- `findIds` respects scopes, soft-delete settings, and relation predicates.

## Default Scope Feedback

The alternate design includes `config.defaultScope(...)`. This is a significant feature and should not be in the first scope implementation.

Risks:

- default scopes are notoriously surprising in Rails
- Joist already has soft-delete behavior that may overlap
- every query path must consistently apply or opt out
- `.unscoped()` semantics need careful design

Recommendation:

- Explicitly defer default scopes.
- Implement named scopes first.
- Revisit default scopes only after there is a stable scope compiler and clear opt-out semantics.

## Additional Test Matrix

Type tests, run with `yarn build`:

- static plain scope chaining
- static parameterized scope chaining in both orders
- builder methods preserve scope accessors
- invalid scope names fail
- invalid filter fields fail
- invalid order fields fail
- invalid parameterized scope args fail
- collection `.and` scope accessors type-check
- direct collection scope accessors type-check only if that API is chosen
- collection method collisions are rejected or hidden behind `.and`
- recursive type spike does not trigger `ts2589`

Runtime tests, run with integration Jest:

- static single scope
- two stacked scopes
- scope plus ad-hoc `where`
- same-field object filters do not silently overwrite
- alias callback conditions compose with object filters
- parameterized scope args affect SQL/results
- `orderBy` composition semantics are documented and tested
- `limit` and `offset` last-write-wins semantics
- `softDeletes` setting behavior
- collection o2m scope
- collection m2m scope
- unsaved collection owner behavior
- already-loaded collection behavior
- runtime typo/collision errors through `any`

## Final Recommendation

Do not choose between the two designs purely on ergonomics yet. The alternate design's static-side introspection is attractive, but it is also the core technical risk.

Recommended path:

1. Spike `Scope<T, typeof Entity>` against real generated Joist entities.
2. If the spike passes, adopt the alternate design's `scope(Author, ...)` static-scope typing and generated `AuthorScope` alias.
3. Keep my design's explicit/generated scope-map approach as the fallback and likely model for `config.scope(...)`.
4. Use `.find(em)` as the primary static terminal API.
5. Use `a1.books.and.published.find()` as the safer v1 collection API.
6. Treat same-field object `where` overwrites as a correctness blocker, not a documentation caveat.
