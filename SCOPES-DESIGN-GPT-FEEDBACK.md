# Adversarial review: `SCOPES-DESIGN-GPT.md`

Reviewer perspective: author of `SCOPES-DESIGN.md`. Line refs `GPT:NN` point at
`SCOPES-DESIGN-GPT.md`; `mine:§N` points at `SCOPES-DESIGN.md`. Facts verified against
`packages/core/src` are cited inline.

## 0. Verdict

The GPT design and mine converge on the same core (lazy immutable fragments → compile to
one `em.find`; terminal `.find(em)`; collection scopes get `em` from the owner). They
diverge on **typing strategy**, and that divergence is the whole ballgame:

- **GPT** types scopes through a hand-written/generated **concrete interface**
  (`UserScopes` + `UserScope`). This is **more boilerplate** and does **not** satisfy the
  stated "no separate `UserScopes` declaration" goal — but it is **type-soundly safe** and,
  importantly, it makes **collection scopes typable** without threading a constructor type.
- **Mine** auto-discovers scope names from `typeof User`, which meets the no-boilerplate
  goal but carries an **unverified `ts2589` recursion risk** (mine:§5.4) that is the single
  biggest threat to that whole approach.

Neither design solves the actually-hard problem both punt on: **codegen cannot see scope
names declared in hand-written entity files**, so fully-automatic typing of `User.active`
is unsolved in both (GPT:381; mine:§5.4 fallback).

GPT also gets two concrete things **more right than my doc did** — see §1 "where GPT is
stronger." This review is adversarial but not partisan.

## 1. Typing correctness

### 1.1 The recommended API (`config.scope`) cannot type the headline feature — internal contradiction

GPT recommends `config.scope("active", {...})` as the **preferred** declaration API
(GPT:51), then admits twice that it **cannot** produce a typed `User.active`:

- GPT:266 — "TypeScript cannot infer `User.active` from a runtime `config.scope(...)` call
  without codegen or declaration merging."
- GPT:381 — "codegen cannot trivially discover arbitrary `config.scope(...)` calls."

So the *recommended* surface delivers a runtime `User.active` (a getter installed at boot)
that is a **type error** at the call site. The entire goal is `await User.active.find(em)`
type-checking. Recommending the one API that can't type it is the doc's central
contradiction. It should either (a) demote `config.scope` to "runtime registration only,
types come from elsewhere," or (b) commit to codegen-generated types and specify the
discovery mechanism. My doc took position (a)+(b) explicitly and chose the static-field
route precisely because **scope names must be statically visible to the type system**.

### 1.2 `ScopeInput<T>` two-shape union is a latent type-safety hole

GPT:95–109 defines:

```ts
type ScopeInput<T> = FilterWithAlias<T> | { where?; conditions?; orderBy?; limit?; offset?; softDeletes?; ... };
"Bare objects are treated as where. Objects with reserved keys (where/orderBy/limit) are full settings." (GPT:109)
```

Problems:

1. **Reserved-key / column-name collision.** `FilterOf<T>` legitimately contains a key for
   any column. Entities with a column named `limit`, `offset`, `order`, `conditions`, or
   `where` (all plausible: `Discount.limit`, `LineItem.order`, `Rule.conditions`) make
   `{ limit: 5 }` ambiguous — filter-on-column vs. setting. The union cannot disambiguate.
2. **Not expressible in types.** Both arms are all-optional object types, so
   `{ orderBy: ... }` structurally satisfies *both* arms; TS won't narrow them. The
   "reserved keys" rule is a **runtime heuristic the type system can't enforce** — so the
   types give a false sense of safety and surprising errors.

Mine avoids this entirely: `where` (the filter) and `.orderBy`/`.limit`/`.offset`
(builders) are **separate surfaces**; the only `where` overload split is object-vs-function
(`mine:§4`), which is cleanly discriminable.

### 1.3 Alias threading is unspecified — the deepest hole

GPT allows per-fragment `where: FilterWithAlias<T>` (carrying `as?: Alias<T>`, GPT:98) and a
fluent `conditions(conditions: ExpressionFilter)` (GPT:118). In Joist, an `ExpressionFilter`
is built from a bound alias (`a.firstName.eq(...)` where `a = alias(Author)`), and
`em.find` binds that alias via `{ as: a }`. The doc never says:

- Where does the alias for a `conditions` fragment come from at **declaration** time?
- When N fragments are ANDed, each potentially carrying its own `as` alias, **which alias
  wins**, and does Joist collapse multiple root aliases or emit duplicate joins?

This is a real correctness risk: scopes that use alias-based predicates (the only way to
express, e.g., `a.books.title.ilike(...)` cross-relation conditions) have no defined alias
story. Mine binds **one** alias at compile (`toFindArgs`, mine:§3.2) and scope predicates
are `(a) => cond`, so every fragment shares the single bound alias. GPT's
object-filter-only examples sidestep this, but the moment `conditions`/`as` are used the
model is undefined. **This needs a concrete answer before either design ships alias-based
scopes.**

### 1.4 `& Scopes` directly on `Collection` collides with real Collection members

GPT:232/239 proposes `Collection<Author, Book> & BookScopes` (direct form). The public
`Collection` interface members are (verified, `relations/Collection.ts:13–43`,
`relations/Relation.ts:8–20`):

```
load, find, includes, add, remove, set, isLoaded, get, getWithDeleted, removeAll, entity, hasBeenSet
```

`find` in particular is **already** a Collection method (find-within-collection), so a Book
scope named `find` is impossible in the direct form, and a scope named `load`/`get`/`set`/
`includes`/`add`/`remove` silently shadows or conflicts. GPT acknowledges the collision risk
(GPT:209) and offers the `.and` namespace (GPT:233/245), which correctly reduces the
reserved surface to the single property `and`. **The `.and` variant is the right call** —
but the name is misleading (`a1.books.and.published` reads as a boolean combinator, not a
scope namespace; `a1.books.scoped.published` or `a1.books.where.published` communicate
intent better — though `where` collides conceptually too). Pick a namespace word that says
"named scopes live here."

### 1.5 Parameterized scopes are unspecified

The goal and Rails section reference argument-taking scopes (GPT:26, "Can later support
argument-taking scopes" GPT:263), but **no API or typing is given**, and the `ScopeInput`
object form structurally **cannot** carry a parameter (it's a static value). So
`User.named("a")` — explicitly in scope per the project ask — has no design. Mine specifies
it: the factory's parameterized overload returns `(...args) => Scope<…>`, and the named
accessor maps function-typed scope members to callable accessors (mine:§5.1, §7).

### 1.6 Terminal `.find` has no populate-aware overload

GPT:122 types `find(em): Promise<T[]>` only. Joist's `em.find` has the
`find<H>(…, { populate }): Promise<Loaded<T,H>[]>` overload, and scopes should preserve it
or you lose typed population through scopes. Mine carries the `Loaded<T,H>` overload on the
terminal (mine:§4). Minor but real gap.

### 1.7 Scope-name vs. builder/terminal-method collision (both docs, GPT worse)

A scope named `where`, `orderBy`, `limit`, `offset`, `find`, `findOne`, or `toFindArgs`
collides with the builder/terminal surface. In GPT's `& Scopes` model a scope named `find`
would **shadow the executor** and break execution silently. Both designs need a
**reserved-name guard** (reject such names at declaration / boot). My Proxy gives builder
methods precedence (so the scope becomes unreachable rather than breaking `find`), which is
less catastrophic but still surprising. Neither doc states a policy; it needs one.

### 1.8 Where GPT's typing is *stronger* than mine

Intellectual honesty — GPT's explicit-interface approach beats mine in three places:

| Point | GPT | Mine |
| --- | --- | --- |
| **Recursion safety** | `UserScope = Scope<User, UserScopes> & UserScopes` with a concrete `UserScopes` interface is ordinary named-interface recursion — **safe, no `ts2589`/`ts7022`**. | `Scope<T, typeof User>` maps over the constructor type and re-embeds itself — **unverified `ts2589` risk** (mine:§5.4), the #1 gate on my whole approach. |
| **Collection typing** | `Collection<Author, Book> & BookScopes` works because `BookScopes` is concrete — **no constructor-threading needed**. | mine:§9.2 flagged that `Collection<O,U>` lacks `typeof Book`, so my `typeof`-based machinery needs codegen to thread the target constructor into relation types — a real blocker GPT doesn't have. |
| **`orderBy` semantics** | **append** (GPT:144) — matches Rails *and* matches Joist's own engine: `QueryParser.ts:591–597` iterates an `orderBy[]` and `addOrderBy` **pushes** (accumulates) each clause. | mine:§3.2 said **last-wins** — **wrong** against both Rails and Joist's runtime. Correct this in my doc; add an explicit `reorderBy`/replace escape hatch. |

Also: GPT correctly names the real internal compile target. `FilterAndSettings<T>` **is** an
exported type (`EntityFilter.ts:8–17`) with exactly `{ where, conditions, orderBy, limit,
offset, softDeletes, allowMultipleLeftJoins, optimizeJoinsToExists }`. `em.find` builds
`settings = { where, ...rest }` (`EntityManager.ts:469–470`) which is structurally that
type. Scopes should compile to `FilterAndSettings<T>` (GPT's term) — my doc's
`{ where } & FindFilterOptions` was the same thing under a non-canonical name.

### 1.9 The shared unsolved problem

Both docs admit codegen can't discover scope names from hand-written entity files. The
honest synthesis: **codegen should *generate* the `UserScopes`/`UserScope` interfaces** so
users don't hand-write them (removing GPT's boilerplate and meeting the "no declaration"
goal) — but that requires scopes to be declared somewhere codegen reads (a manifest, a
typed `scopes` block it can parse, or DB/config metadata). Neither doc specifies that
mechanism; it is the real design work remaining. If it's solved, GPT's safe explicit-
interface typing + generation beats my risky `typeof`-discovery. If it's not, my approach
is the only one that gives `User.active` typing with zero codegen — *if* the recursion
holds.

## 2. Test cases to cover

GPT's list (GPT:457–467) is a good start but thin on adversarial/edge cases and omits
parameterized scopes, cycles, immutability, populate, and reserved-name collisions.
Consolidated checklist (runtime unless marked **[type]**):

### Composition & semantics
- `User.active.find(em)` applies the scope's `where`.
- `User.adult.active.find(em)` ANDs both predicates (assert via `toMatchEntity` on results,
  and/or assert compiled `toFindArgs`).
- **Same-field stacking**: `User.adult.where({ age: { lte: 65 } })` →
  `age >= 18 AND age <= 65`, not overwrite — via the alias/`(a) => …` form. Separately test
  the **object-where same-field** case and assert the *documented* behavior (last-wins or
  reroute-to-conditions — pick one, §1.2/§2 of GPT:148–154).
- `orderBy` **appends** across fragments: `recent` (createdAt DESC) then `.orderBy({ firstName })`
  → `ORDER BY created_at DESC, first_name` (matches `QueryParser.ts:591`). Test a
  `reorderBy`/replace escape hatch if added.
- `limit`/`offset`: last fragment wins.
- `softDeletes`: scope can set include/exclude; last wins; interaction with a default scope.
- **Default scope** (`config.defaultScope`) is prepended to every compile, and `.unscoped()`
  (or chosen opt-out) removes it. *(GPT omits default scopes entirely — gap.)*

### Parameterized & cross-scope
- `User.named("a").find(em)` (parameterized) — *(GPT has no design for this; must be added).*
- `User.named("a").adult.find(em)` (parameterized + chained).
- Cross-scope reference: `recentAdults = adult.orderBy(...).limit(...)` resolves correctly.
- **Cycle guard**: scope A references B references A → terminates (throws or dedupes), no
  infinite loop / stack overflow.

### Execution surface
- `findOne` / `findOneOrFail` / `findCount` / `findIds` terminals behave like their `em.*`
  counterparts.
- **Populate**: `User.active.find(em, { populate: "books" })` returns `Loaded<User,"books">[]`
  and actually preloads. *(GPT terminal lacks the overload.)*
- Optional `em.find(User, User.active)` overload if implemented (the project decision was
  terminal-only, so this may be intentionally absent).

### Collection-bound
- `a1.books.published.find()` ANDs the relation predicate *and* the scope, using the
  owner's `em` (no `em` arg).
- `a1.books.published.where({ title: { ilike: "%orm%" } }).find()` composes.
- m2m relation (`a1.tags.active`) uses the join-table predicate, not a naive FK filter.
- **Issues a query**, not an in-memory filter of the loaded collection (GPT:463) — assert
  it calls `em.find`.
- **Unsaved/WIP correctness**: (a) collection scope on a **new owner** (no id) — defined
  behavior (recommend throw for v1, mine:§9.3); (b) owner has **unflushed added children** —
  does the query see them? A pure `em.find` will **miss WIP children** (consider
  `findWithNewOrChanged`). Test and document.
- `.and`-namespace variant (`a1.books.and.published`) if chosen (GPT:462).

### Immutability & identity
- Reading `User.active` twice and chaining differently does not mutate the shared base or
  the other chain.
- `User.active` then `User.active.adult` — the first is unaffected.

### Type-level (`@ts-expect-error` + `yarn build`)
- **[type]** Deep chain compiles: `User.active.adult.active.adult.where(...).find(em)` (this
  is the `ts2589` canary for the `typeof`-based approach; for GPT's interface approach it
  proves the recursive interface resolves).
- **[type]** `User.bogus` is an error (unknown scope name).
- **[type]** invalid field in `.where`, invalid key in `.orderBy` error.
- **[type]** parameterized scope called with wrong arg type errors; called with no args (when
  required) errors.
- **[type]** populate hint typing flows: `Loaded<T,H>` on the result.
- **[type]** collection-scope chain types: `a1.books.published.where(...).find()` and
  `a1.books.<bogus>` errors.
- **[type/runtime]** reserved-name collision: declaring a scope named `find`/`where`/`limit`
  is rejected (or documented precedence).

### Inheritance (neither doc addresses)
- STI/CTI subtype inherits base-type scopes (Rails: subclasses inherit scopes). Test
  `Subtype.baseScope.find(em)` and that `keyof typeof Subtype` / the generated interface
  includes inherited scopes.

## 3. API ergonomics

### 3.1 Declaration

| Surface | Verdict |
| --- | --- |
| `config.scope("active", {...})` (GPT preferred, GPT:51) | Centralized and consistent with `ConfigApi`, but **string names** are typo-prone and not refactor-safe, and it **cannot type `User.active`** without codegen (§1.1). The object value also can't carry parameters or a bound alias ergonomically. Good as a *runtime* registration layer, wrong as the *typed* surface. |
| `static active = scope<User>(...)` (GPT:268) | GPT itself notes it "repeats the generic" and "still needs a scope map generic" for chaining (GPT:286). Correct critique. |
| `static active: UserScope = scope<User, UserScopes>({...})` (GPT first slice, GPT:407) | Type-safe and chainable, but requires **two hand-written declarations per entity** (`UserScopes` + `UserScope`) — *more* boilerplate, and exactly the `UserScopes` declaration the project ask wanted to avoid. |
| `static adult: AuthorScope = scope(Author, (a)=>…)` (mine:§5.3, codegen alias) | One **name-free** generated alias per entity; names auto-discovered from `typeof Author`; no hand interface. Best ergonomics **iff** the recursion is safe (§1.8). |

Ergonomic ranking for the stated goal ("no `UserScopes` declaration, just `scope`"): mine >
GPT, but only if `ts2589` is cleared. If it isn't, the realistic best is **codegen-generated
interfaces** (turn GPT's hand-written `UserScopes` into a generated artifact) — which needs
the discovery mechanism neither doc specifies (§1.9).

### 3.2 `ScopeInput` shape

GPT's dual object shape (§1.2) is an ergonomic and correctness footgun. Prefer **distinct
verbs**: `scope(Entity, whereOrFn)` for the predicate, and `.orderBy/.limit/.offset/.softDeletes`
builders (or a clearly-keyed second `settings` arg) for options — never overload "is this
object a filter or a settings bag?".

### 3.3 Execution

Both land on `.find(em)` and reject ambient `await User.active` (GPT:178/342; mine:§2) —
agreed and correct. GPT enumerates `using(em)` and `em.find(User, User.active)` as
alternatives and correctly demotes them; the project decision is **terminal-only**, so those
stay out of v1. Collection scopes dropping the `em` arg (owner supplies it) is a genuine
ergonomic win both docs share — worth highlighting as the reason collection scopes feel
nicer than static ones.

### 3.4 Collection namespace

`.and` (GPT:233) is the safer ergonomics (avoids the 12-member collision set in §1.4) but a
poor name. Recommend a clearer namespace token. Direct-on-collection (`a1.books.published`)
is prettier but unsafe given `find`/`load`/`get`/etc. already exist on `Collection` — do not
ship the direct form.

## 4. Bottom line

- Adopt from GPT: **`orderBy` append** (it's both Rails- and Joist-correct; fix my doc),
  compile to the real **`FilterAndSettings<T>`** type, the **`.and`-style namespace** for
  collection scopes (with a better name), and — if the recursion risk in mine:§5.4 proves
  real — GPT's **concrete-interface typing** (ideally codegen-*generated*, not hand-written).
- Reject from GPT: **`config.scope` as the primary *typed* API** (can't type the goal),
  the **`ScopeInput` dual-object union** (reserved-key ambiguity), **direct `& Scopes` on
  Collection** (member collisions), and shipping without a story for **parameterized scopes**,
  **alias threading**, **populate typing**, **cycles**, and **reserved scope names**.
- Unsolved by both, and the real next step: **how codegen learns scope names** so the
  typing can be generated rather than hand-written. Resolve §1.1/§1.9 before picking the
  typing strategy; resolve §1.3 (alias threading) before any alias-based scope ships.
