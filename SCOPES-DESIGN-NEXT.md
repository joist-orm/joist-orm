# Scopes: follow-ups

Status: **post-v1 backlog.** v1 (engine, `scope()` factory, Proxy named-accessors, codegen
`AuthorScope` alias, terminals) is implemented in `packages/core/src/scopes.ts` and tested in
`packages/tests/integration/src/EntityManager.scopes.test.ts`. This file tracks what's left,
the gaps found while building, and the decisions still open. See `SCOPES-DESIGN.md` for the
original design and section numbers referenced below.

## Done in v1 (for context)

- Object-form, alias-condition, and parameterized (`scope.fn`) scopes.
- Named-accessor chaining (`Author.adult.popular`) with AND semantics, resolved at compile.
- Builders: `where` / `orderBy` / `limit` / `offset` / `softDeletes`.
- Terminals: `find` (+ `populate`), `findOne`, `findOneOrFail`, `findCount`, `findIds`, `toFindArgs`.
- Immutability: base scopes are static-field singletons; builders return fresh clones.

---

## 1. Bugs / gaps to fix

### 1.1 Forward/mutual cross-scope refs in *definitions* don't work

**Implemented:** named accessors are lazy during static initialization, and `compile()`'s cycle guard
is now load-bearing defensive code.

**Contradicts design §8**, which claims "forward/mutual references work." They don't.

Previously, `makeScope`'s Proxy getter eagerly read `cstr[prop]` to decide plain-vs-parameterized:

```ts
const sibling = cstr[prop];
if (sibling === undefined) return undefined;          // <-- forward ref lands here
if (typeof sibling === "function") return (...args) => next({ kind: "ref", name, args });
return next({ kind: "ref", name: prop });
```

Static fields initialize top-to-bottom, and direct initializer-time composition runs before entity
metadata is registered. The proxy now records unknown named-scope refs before metadata exists and
resolves them later at compile/terminal time:

```ts
static popular: AuthorScope = scope((a) => a.isPopular.eq(true));
static adult: AuthorScope = scope({ age: { gte: 18 } });
static popularAdult: AuthorScope = Author.popular.adult;
~~~~```

`packages/tests/integration/src/entities/Author.ts` has `popularAdult` declared after `adult` and
`popular` as the positive example of this pattern.

Mutual refs (`a → b`, `b → a`) can now be constructed, so the `compile()` cycle guard is no longer
dead code.

**Remaining caveat:** direct `Author.someScope` refs still obey JS static field order. If a composed
scope needs to reference a sibling declared below it, use the scope accessor form so the ref is
recorded lazily, i.e. `scope({}).laterScope`.

### 1.2 Codegen only detects bare `scope(...)` / `scope.fn(...)`

`isScopeInitializer` in `packages/codegen/src/findEntityScopes.ts` matches only a `scope(...)`
call or `scope.fn(...)` call. A **composed** named scope is not registered into `AuthorScopes`:

```ts
static recentAdults: AuthorScope = scope({ age: { gte: 18 } }).orderBy({ createdAt: "DESC" });
```

It works when called directly (`Author.recentAdults.find(em)` — it's a real static field), but is
invisible as a chain accessor: `Author.adult.recentAdults` won't typecheck, because the name never
makes it into the `AuthorScopes` interface.

**Fix (if §8 composed scopes are a goal):** broaden `isScopeInitializer` to accept a call/property
chain whose root is the `scope` identifier (walk `CallExpression`/`PropertyAccessExpression` down to
the base). Pairs naturally with 1.1(b).

### 1.3 Terminal `opts` can clobber compiled `conditions`

`find(em, opts)` spreads user opts over the scope's compiled options:

```ts
return em.find(cstr, args.where, { ...toFindOptions(args), ...opts });
```

So `find(em, { conditions })` **replaces** the scope's alias-conditions instead of ANDing them.
Same for `findOne` / `findOneOrFail`.

**Options:** merge `conditions` (AND user's into the scope's), or document that `.where(...)` is the
supported way to add conditions and terminal `opts` is for `populate` / paging only.

---

## 2. Open decisions

### 2.1 Same-field object-`where` stacking (design open Q3)

Two object-form scopes on the same field collapse via `Object.assign` (last wins), they do **not**
AND:

```ts
Author.senior.adult.find(em)   // age >= 18 wins (NOT age >= 65)
```

Pinned as a documented-behavior test (`"lets same-field object-where scopes last-win"`). Decide:
keep silent last-wins + steer users to the `(a) => ...` alias form, or detect key collisions and
reroute to ANDed `ColumnCondition`s.

### 2.2 Close design open Q2 (memoize base scope)

Resolved in practice: base scopes are static-field singletons (`Author.adult === Author.adult`),
builders return fresh immutable clones. Proven by the `immutability` tests. Recommend marking Q2
closed in `SCOPES-DESIGN.md`.

### 2.3 `default_scope` vs the `active` example

`static active = scope({ deletedAt: null })` overlaps the built-in soft-delete default (`em.find`
already excludes soft-deleted). This is really the `default_scope` use case — fold into phase 5
rather than shipping it as a hand-written example scope.

---

## 3. Unbuilt phases (from design §10)

| Phase | Item | Notes |
| --- | --- | --- |
| 5 | `config.defaultScope(...)` + `.unscoped()` | Prepend ops to every compile; needs opt-out spelling (open Q4). |
| 6 | Association scopes (`author.books.published`) | Pin reverse FK; gets `em` for free. Needs `typeof Target` threaded through generated relations for clean typing (open Q5) + new-owner policy (throw vs in-memory vs `findWithNewOrChanged`). |
| 7 | `or` / `merge` / `and` | Emit an `{ or: [...] }` expression term combining each side's compiled conditions. |

## 4. Smaller notes

- **`em` typing:** terminals take the bare core `EntityManager` (no context/driver generics). Works
  for app `EntityManager` subclasses via covariance; a custom `Em`/context won't be inferred. Fine
  for now.
- **`findIds` paging:** scope `.limit()`/`.offset()`/`.orderBy()` intentionally do **not** flow to
  `findCount`/`findIds` (`em.findIds` uses `FindCountFilterOptions`, which has no such fields).
  Document so it isn't mistaken for a bug.
