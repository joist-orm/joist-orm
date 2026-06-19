# Rails-Style Scopes for Joist

## Goal

Add a Rails-inspired scope API for Joist entities that makes common `em.find` filters easy to name, compose, and execute:

```ts
await User.active.find(em);
await User.adult.active.find(em);
await User.adult.active.where({ firstName: "Jane" }).find(em);

const a1 = await em.load(Author, "a:1");
await a1.books.published.find();
await a1.books.and.published.find();
```

Scopes should be a thin, typed composition layer over Joist's existing `em.find` syntax. Internally they should compile to `FilterAndSettings<T>` and execute through the normal find pipeline.

## Rails Capabilities to Model

Rails scopes are named, lazy, composable query fragments:

- `scope :active, -> { where(active: true) }`
- scopes chain with other scopes and query methods: `User.active.adult.where(...)`
- chained `where` clauses merge with AND semantics
- scopes can include ordering, limit, offset, joins/includes, and arguments
- scopes return a relation-like object, not an already-loaded array
- scopes can call other scopes from within scope definitions

For Joist, the useful concepts are composability, laziness, typed reuse, and collection-bound composition. Joist does not need Rails-style enumerable relations or implicit execution.

## Current Joist Fit

Relevant existing files and types:

- `packages/core/src/EntityManager.ts`
- `FindFilterOptions<T>` already contains `conditions`, `orderBy`, `limit`, `offset`, `softDeletes`, and join optimization flags.
- `em.find(type, where, options)` already builds `{ where, ...options }` and delegates to find dataloaders.
- `packages/core/src/EntityFilter.ts`
- `FilterAndSettings<T>` is the natural internal scope target.
- `FilterWithAlias<T>`, `ExpressionFilter`, and `OrderOf<T>` already model scope inputs.
- `packages/core/src/typeMap.ts`
- `FilterOf<T>` and `OrderOf<T>` are generated through `TypeMap` and should drive scope typing.
- `packages/core/src/config.ts`
- `ConfigApi<T, C>` is the natural declaration surface for `config.scope(...)`.
- `packages/codegen/src/generateEntityCodegenFile.ts`
- Generated entity code already owns filter/order types, `userConfig`, `TypeMap` entries, and static metadata declarations.

## Recommended Public API

Use `config.scope(...)` as the preferred declaration API:

```ts
config.scope("active", { active: true });
config.scope("adult", { age: { gte: 18 } });

config.scope("recent", {
  where: {},
  orderBy: { createdAt: "DESC" },
  limit: 20,
});
```

Use `.find(em)` as the primary static execution API:

```ts
await User.active.find(em);
await User.active.adult.find(em);
await User.adult.active.where({ firstName: "Jane" }).find(em);
await User.recent.limit(10).find(em);
```

Collection-bound scopes can omit `em` because the owner already has one:

```ts
const a1 = await em.load(Author, "a:1");
await a1.books.published.find();
await a1.books.published.where({ title: { ilike: "%orm%" } }).find();
```

Collection-bound scopes may also be exposed through an explicit `and` namespace:

```ts
await a1.books.and.published.find();
await a1.books.and.published.where({ title: { ilike: "%orm%" } }).find();
```

The `and` form reads as "the author's books AND the published scope" and avoids putting every target-entity scope directly on the collection object.

## Scope Input Shape

Prefer a two-shape input:

```ts
type ScopeInput<T extends Entity> =
  | FilterWithAlias<T>
  | {
      where?: FilterWithAlias<T>;
      conditions?: ExpressionFilter;
      orderBy?: OrderOf<T> | OrderOf<T>[];
      limit?: number | undefined;
      offset?: number | undefined;
      softDeletes?: "include" | "exclude";
      allowMultipleLeftJoins?: boolean;
      optimizeJoinsToExists?: boolean;
    };
```

Bare objects are treated as `where`. Objects with reserved setting keys like `where`, `orderBy`, or `limit` are treated as full scope settings.

## Core Runtime Design

Add a core scope implementation, likely `packages/core/src/Scope.ts`:

```ts
export interface Scope<T extends Entity, Scopes = unknown> {
  where(where: FilterWithAlias<T>): Scope<T, Scopes> & Scopes;
  conditions(conditions: ExpressionFilter): Scope<T, Scopes> & Scopes;
  orderBy(orderBy: OrderOf<T> | OrderOf<T>[]): Scope<T, Scopes> & Scopes;
  limit(limit: number | undefined): Scope<T, Scopes> & Scopes;
  offset(offset: number | undefined): Scope<T, Scopes> & Scopes;
  find(em: EntityManager): Promise<T[]>;
  toFilterAndSettings(): FilterAndSettings<T>;
}

export interface BoundScope<T extends Entity, Scopes = unknown> extends Scope<T, Scopes> {
  find(): Promise<T[]>;
}
```

Implementation notes:

- Store immutable fragments, e.g. `ScopeFragment<T>[]`, instead of eagerly deep-merging filters.
- Each fluent method returns a new scope with one additional fragment.
- Named scope getters append that named scope's fragments, enabling `User.adult.active`.
- Use a private symbol marker for `isScope(value)`.
- Each static scope carries its entity constructor/metadata so `.find(em)` does not need the entity type repeated.
- Each collection-bound scope carries the owner relation fragment and owner `em`.

## Composition Rules

- `where`: AND together by preserving fragments until normalization.
- `conditions`: AND together with existing conditions.
- `orderBy`: append into an array to preserve call order, unless a future `reorderBy` is added.
- `limit` and `offset`: last fragment wins.
- settings flags like `softDeletes`: last fragment wins.

Normalization should avoid unsafe overwrites like:

```ts
User.adult.where({ age: { lt: 65 } })
```

when `adult` is `{ age: { gte: 18 } }`. Prefer preserving fragments or converting duplicate-field filters into AND-ed `conditions`.

## Execution

Static scope execution:

```ts
async find(em: EntityManager): Promise<T[]> {
  const { where, ...options } = this.toFilterAndSettings();
  return em.find(this.entity, where, options);
}
```

Collection-bound scope execution:

```ts
async find(): Promise<T[]> {
  const { where, ...options } = this.toFilterAndSettings();
  return this.owner.em.find(this.entity, where, options);
}
```

An optional lower-level `em.find(User, User.active)` overload can be added, but it should not be the primary documented API.

Do not initially support plain `await User.active`; it requires an ambient/current `EntityManager` and risks executing against the wrong unit of work.

## Collection-Bound Scopes

Collection scopes should compile to the target entity scope plus the collection relation predicate:

```ts
await a1.books.published.find();
```

Conceptually equivalent for simple one-to-many relations:

```ts
await Book.published.where({ author: a1 }).find(em);
```

For many-to-many and other relation shapes, Joist must use the relation-specific predicate/join-table handling it already uses to load the collection.

Direct collection scopes:

```ts
await a1.books.published.find();
```

Pros:

- Shorter.
- More Rails-like.

Cons:

- Scope names can collide with existing collection methods/properties.
- Autocomplete can become noisy if the target entity has many scopes.

`and`-namespaced collection scopes:

```ts
await a1.books.and.published.find();
```

Pros:

- Avoids collisions except for the single reserved `and` property.
- Keeps collection autocomplete cleaner.
- Communicates that a relation predicate and a named scope are being combined.

Cons:

- Slightly more verbose.
- Less Rails-like than direct `a1.books.published`.

Typing options:

```ts
type DirectScopedCollection<T extends Entity, Scopes> = Collection<any, T> & Scopes;
type AndScopedCollection<T extends Entity, Scopes> = Collection<any, T> & { and: Scopes };
```

Generated relation return types could become:

```ts
get books(): Collection<Author, Book> & BookScopes;
```

or:

```ts
get books(): Collection<Author, Book> & { and: BookScopes };
```

## Declaration API Alternatives

### `config.scope(...)`

```ts
config.scope("active", { active: true });
config.scope("adult", { age: { gte: 18 } });
```

Pros:

- Best fit for Joist's existing `ConfigApi` customization style.
- Centralizes scope declarations with defaults/hooks/rules.
- Can validate duplicate or reserved scope names during boot.
- Can later support argument-taking scopes.

Cons:

- TypeScript cannot infer `User.active` from a runtime `config.scope("active", ...)` call without codegen or declaration merging.

### `static active = scope<User>(...)`

```ts
export class User extends UserCodegen {
  static active = scope<User>({ active: true });
  static adult = scope<User>({ age: { gte: 18 } });
}
```

Pros:

- Simple first-level static typing.
- No string names.
- Can work before full `config.scope` support.

Cons:

- Repeats the generic.
- `User.active.adult` typing still needs a scope map generic.
- Runtime registration/binding is awkward.

### `static active = UserScope.new(...)`

```ts
export class User extends UserCodegen {
  static active = UserScope.new({ active: true });
  static adult = UserScope.new({ age: { gte: 18 } });
}
```

Pros:

- Avoids `scope<User>(...)` repetition.
- Generated factory can know `FilterOf<User>` and `OrderOf<User>`.

Cons:

- Adds generated symbols per entity.
- Still needs a scope map for chained scope typing.

### `scopes(User).active` / `User.scopes.active`

```ts
await scopes(User).active.adult.find(em);
await User.scopes.active.where({ firstName: "Jane" }).find(em);
```

Pros:

- Easiest type model.
- Avoids mutating entity static sides.

Cons:

- Does not meet the desired Rails-like `User.active` API.

## Execution API Alternatives

### Recommended: `User.active.find(em)`

```ts
await User.active.find(em);
```

Keeps `EntityManager` explicit while avoiding repeated entity arguments.

### Low-level: `em.find(User, User.active)`

```ts
await em.find(User, User.active);
```

Smallest conceptual change, but less ergonomic and repeats `User`.

### Ambient: `await User.active`

```ts
await User.active;
```

Most Rails-like, but not recommended initially because Joist has no ambient/current `EntityManager` pattern and thenable query objects are surprising.

### Bound thenable: `await User.active.using(em)`

```ts
await User.active.using(em);
```

Avoids ambient state but introduces thenable query objects and is less clear than `.find(em)`.

## Typing Strategy

The hard part is typing `User.active.adult`, not `.where(...)`.

Generated or declared scope maps should look like:

```ts
export interface UserScopes {
  active: UserScope;
  adult: UserScope;
}

export type UserScope = Scope<User, UserScopes> & UserScopes;
```

Then these type-check:

```ts
User.active;
User.active.adult;
User.active.where({ firstName: "Jane" });
```

Because user entity files are not overwritten, codegen cannot trivially discover arbitrary `config.scope(...)` calls. Viable approaches:

- Require scope names in schema/config metadata that codegen can read.
- Generate an empty `UserScopes` interface and let users augment it manually.
- Provide a companion declaration helper for runtime `config.scope(...)` declarations.

## Recommended First Implementation Slice

Build the core model first, before solving fully automatic `config.scope(...)` typing:

1. Add `packages/core/src/Scope.ts` with immutable scope fragments, `scope<T>()`, `isScope`, `ScopeInput<T>`, `Scope<T, Scopes>`, and `BoundScope<T, Scopes>`.
2. Add `.find(em)` execution on static scopes, implemented by compiling to public `em.find` args.
3. Add `.find()` execution on collection-bound scopes.
4. Add fluent `.where`, `.conditions`, `.orderBy`, `.limit`, and `.offset` APIs.
5. Optionally add `em.find` overloads for scope inputs as a convenience.
6. Support manual static declarations:

```ts
export interface UserScopes {
  active: UserScope;
  adult: UserScope;
}

export type UserScope = Scope<User, UserScopes> & UserScopes;

export class User extends UserCodegen {
  static active: UserScope = scope<User, UserScopes>({ active: true });
  static adult: UserScope = scope<User, UserScopes>({ age: { gte: 18 } });
}
```

7. Add `ConfigApi.scope` if runtime registration/static getter installation can be completed cleanly; otherwise keep it as the long-term ergonomic layer.

## Likely Files To Modify

Core:

- `packages/core/src/Scope.ts`
- `packages/core/src/EntityManager.ts`
- `packages/core/src/Collection.ts` and related collection/large-collection files
- `packages/core/src/EntityFilter.ts` if shared scope input types belong near filters
- `packages/core/src/config.ts` if adding `config.scope`
- `packages/core/src/index.ts`

Codegen:

- `packages/codegen/src/generateEntityCodegenFile.ts`
- `packages/codegen/src/symbols.ts`
- relation return-type generation for collection scope maps

Tests:

- `packages/tests/integration/src/entities/User.ts` or another entity file for example scopes
- `packages/tests/integration/src/entities/User.test.ts` or a new scope-focused test file

## Verification

Runtime tests from `packages/tests/integration`:

```bash
yarn jest -- src/entities/User.test.ts
```

Type tests from repository root:

```bash
yarn build
```

Broader integration verification:

```bash
cd packages/tests/integration
yarn test-stock
```

Test cases to include:

- `User.active.find(em)` applies scope `where`.
- `User.active.adult.find(em)` ANDs both filters.
- `a1.books.published.find()` applies both the `Author.books` relation predicate and the `Book.published` scope.
- `a1.books.and.published.find()` is tested if the `.and` namespace variation is chosen.
- collection-bound scopes query through `em.find` instead of loading/filtering the whole collection in memory unless explicitly chosen and tested.
- `User.active.where(...)` composes with manual filters.
- repeated `.where` on the same field preserves AND semantics or has a documented limitation.
- `.orderBy`, `.limit`, and `.offset` compile to `FindFilterOptions<T>`.
- invalid fields in `.where` and `.orderBy` fail typechecking via `@ts-expect-error` and `yarn build`.
