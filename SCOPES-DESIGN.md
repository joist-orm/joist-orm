# Design: Rails-style scopes for Joist

Status: **draft / design only** — nothing implemented yet.

## 1. Goal

Add named, composable, chainable query fragments ("scopes") to Joist entities that
**compile down to a single `em.find`**. A scope is nothing more than a reusable,
stackable bag of `em.find` parameters.

Target ergonomics (the thing we're optimizing for):

```ts
await Author.adult.find(em);                          // single scope
await Author.adult.popular.find(em);                  // stacked (ANDed)
await Author.adult.popular.where({ age: { lte: 65 } }).find(em);  // + ad-hoc query
await Author.named("a").orderBy({ age: "DESC" }).limit(5).find(em);  // parameterized
```

### Rails capabilities to match

| Rails | Priority | Plan |
| --- | --- | --- |
| `scope :active, -> { where(active: true) }` | must | `static active = scope(Author, (a) => a.status.eq("active"))` |
| Chaining `User.active.adult` | must | named accessors on the scope object |
| `.where(...)` after a scope | must | `where`/`orderBy`/`limit`/… builders return `this` |
| AND semantics when stacking | must | compile each fragment to an ANDed `conditions` term |
| Parameterized `scope :named, ->(p){...}` | must | scope factory returns a function |
| Lazy (nothing runs until executed) | must | scope is an inert builder; `.find(em)` is the only trigger |
| `default_scope` | nice | `config.defaultScope(...)` — prepend ops to every compile |
| Association scopes `author.books.published` | explore | §9 — feasible, gets `em` for free |
| `or` / `merge` / `and` | later | `{ or: [...] }` expression term |

## 2. The one constraint that shapes everything: no ambient `em`

Rails has a global connection; Joist deliberately does not — every query needs an
`EntityManager`. So a scope **cannot** be `await Author.adult` (there is no `em` to run
it). A Joist scope is a **lazy bag of `em.find` parameters**, executed by handing it an
`em` via a **terminal method** (decision: terminal-only for v1, no `em.find(scope)`
overload):

```ts
await Author.adult.active.find(em);      // Promise<Author[]>
await Author.adult.findOne(em);          // Promise<Author | undefined>
await Author.adult.findCount(em);        // Promise<number>
```

(Association scopes are the exception — they get `em` for free from the owning entity;
see §9.)

## 3. Architecture — one engine under every surface

### 3.1 A scope is an immutable, ordered list of ops

Every builder call returns a **new** scope, so a static like `Author.adult` — read many
times — is never mutated.

```ts
type ScopeOp<T extends Entity> =
  | { kind: "where";   where: FilterOf<T> }                                       // object filter
  | { kind: "cond";    fn: (a: Alias<T>) => ExpressionCondition | ExpressionCondition[] }
  | { kind: "ref";     name: string; args?: any[] }                              // reference another named scope
  | { kind: "orderBy"; orderBy: OrderOf<T> | OrderOf<T>[] }
  | { kind: "limit";   n: number }
  | { kind: "offset";  n: number }
  | { kind: "softDeletes"; v: "include" | "exclude" };
```

### 3.2 Compile → exactly the shape `em.find` wants

Ops compile to one `em.find` call using a single bound alias plus `conditions`. Using
`conditions` (not a merged `where`) is what gives true Rails-style AND semantics and
dodges the `{ age: 1 }`-vs-`{ age: 2 }` key-collision footgun — both predicates become
ANDed `ColumnCondition`s on the same alias.

```ts
class ScopeImpl<T extends Entity> {
  constructor(readonly meta: EntityMetadata<T>, readonly ops: readonly ScopeOp<T>[]) {}

  private add(op: ScopeOp<T>) { return new ScopeImpl(this.meta, [...this.ops, op]); }

  where(w: FilterOf<T> | ((a: Alias<T>) => any)) {
    return this.add(typeof w === "function" ? { kind: "cond", fn: w } : { kind: "where", where: w });
  }
  orderBy(o: OrderOf<T> | OrderOf<T>[]) { return this.add({ kind: "orderBy", orderBy: o }); }
  limit(n: number)  { return this.add({ kind: "limit", n }); }
  offset(n: number) { return this.add({ kind: "offset", n }); }

  toFindArgs(): { where: FilterWithAlias<T>; options: FindFilterOptions<T> } {
    const a = alias(this.meta.cstr);
    const conditions: ExpressionCondition[] = [];
    const wheres: FilterOf<T>[] = [];
    let orderBy: any, limit: number | undefined, offset: number | undefined, softDeletes: any;

    const expand = (ops: readonly ScopeOp<T>[], seen: Set<string>) => {
      for (const op of ops) {
        switch (op.kind) {
          case "cond": conditions.push(...toArray(op.fn(a))); break;
          case "where": wheres.push(op.where); break;
          case "orderBy": orderBy = op.orderBy; break;   // last-wins, like Rails `reorder`
          case "limit": limit = op.n; break;
          case "offset": offset = op.n; break;
          case "softDeletes": softDeletes = op.v; break;
          case "ref": {                                  // resolve a referenced named scope, guard cycles
            if (seen.has(op.name)) break;
            seen.add(op.name);
            const target = lookupNamedScope(this.meta, op.name, op.args);
            expand(target.ops, seen);
            break;
          }
        }
      }
    };
    expand(this.ops, new Set());

    return {
      where: { as: a, ...Object.assign({}, ...wheres) },   // disjoint object-wheres merge by Object.assign
      options: {
        conditions: conditions.length ? { and: conditions } : undefined,
        orderBy, limit, offset, softDeletes,
      },
    };
  }

  // terminals — pure delegation to em.find
  find(em: EntityManager): Promise<T[]>;
  find<const H extends LoadHint<T>>(em: EntityManager, opts?: FindFilterOptions<T> & { populate?: H }): Promise<Loaded<T, H>[]>;
  async find(em: any, opts?: any) {
    const { where, options } = this.toFindArgs();
    return em.find(this.meta.cstr, where, { ...options, ...opts });
  }
  // findOne / findOneOrFail / findCount / findIds: same delegation to the matching em.* method
}
```

Correctness notes (confirmed against the current `em.find` types):

- `where` (object filters) and `options.conditions` (alias predicates) **coexist** in a
  single `em.find` and are ANDed; both bind the same `{ as: a }`. (The `findCount`
  `isSelectAll` check inspects both, which proves they travel together.)
- **Same-field stacking is only safe through the `(a) => …` form.** `adult` ⇒
  `a.age.gte(18)` plus `.where((a) => a.age.lte(65))` ⇒ two ANDed `ColumnCondition`s.
  Two *object* `where`s on the same key (`{ age: 18 }` then `{ age: 20 }`) collapse via
  `Object.assign` (last wins) — documented limitation; steer same-field composition to
  the alias form.
- **Cross-scope references** are stored as `{ kind: "ref" }` and resolved at compile time
  with a cycle guard, so forward/mutual references work and the chain stays lazy.

## 4. Public API surface

```ts
declare const scopeType: unique symbol;   // phantom brand used by the type machinery (§5)

export interface ScopeQuery<T extends Entity> {
  // builders — return `this` so the named accessors survive arbitrarily deep chains
  where(where: FilterOf<T>): this;
  where(fn: (a: Alias<T>) => ExpressionCondition | ExpressionCondition[]): this;
  orderBy(orderBy: OrderOf<T> | OrderOf<T>[]): this;
  limit(n: number): this;
  offset(n: number): this;
  softDeletes(v: "include" | "exclude"): this;

  // terminals (decision: terminal `.find(em)` only for v1)
  find(em: EntityManager): Promise<T[]>;
  find<const H extends LoadHint<T>>(em: EntityManager, opts?: FindFilterOptions<T> & { populate?: H }): Promise<Loaded<T, H>[]>;
  findOne(em: EntityManager): Promise<T | undefined>;
  findOneOrFail(em: EntityManager): Promise<T>;
  findCount(em: EntityManager): Promise<number>;
  findIds(em: EntityManager): Promise<string[]>;

  toFindArgs(): { where: FilterWithAlias<T>; options: FindFilterOptions<T> };
  readonly [scopeType]?: T;   // marker the mapped type uses to find scope-typed statics
}
```

## 5. Typing: literal `Author.adult` with **no hand-written names interface**

This is the crux, and the answer to "with just `scope<User>`, can we find the sibling
statics?"

### 5.1 Why a bare `scope<User>(...)` cannot, but `scope(User, ...)` can

The sibling scope **names live in exactly one place: the entity's static members.** From
the *instance* type `User` there is no way to reach `typeof User`'s statics (TS has no
"constructor-of-instance" operator). So `scope<User>(...)` — instance type only — is
structurally unable to discover `adult`, `active`, etc.

But if we pass the **constructor value** and infer its type `C = typeof User`, the names
become reachable: `keyof C` includes `adult`, `active`, … We then keep only the
scope-typed statics and turn each into a chainable accessor:

```ts
// keep only the statics whose type is a scope (or a function returning one)
type ScopeNames<C> = {
  [K in keyof C]:
    NonNullable<C[K]> extends { [scopeType]?: any } ? K
    : NonNullable<C[K]> extends (...a: any[]) => { [scopeType]?: any } ? K
    : never;
}[keyof C];

export type Scope<T extends Entity, C> = ScopeQuery<T> & {
  [K in ScopeNames<C>]: C[K] extends (...a: infer A) => any
    ? (...a: A) => Scope<T, C>   // parameterized scope → callable
    : Scope<T, C>;               // plain scope → getter
};

export function scope<C extends MaybeAbstractEntityConstructor<any>>(
  cstr: C,
  fn: (a: Alias<InstanceType<C>>) => ExpressionCondition | ExpressionCondition[],
): Scope<InstanceType<C>, C>;
// parameterized overload
export function scope<C extends MaybeAbstractEntityConstructor<any>, A extends any[]>(
  cstr: C,
  fn: (...args: A) => (a: Alias<InstanceType<C>>) => ExpressionCondition | ExpressionCondition[],
): (...args: A) => Scope<InstanceType<C>, C>;
```

`ScopeNames<C>` naturally excludes `metadata`, `tagName`, `prototype`, and the
`Function.prototype` members, since none of them carry the `scopeType` brand.

### 5.2 The unavoidable cost: a per-field type annotation

`static adult = scope(Author, …)` alone triggers TS error **7022** ("'adult' implicitly
has type 'any' because it is referenced directly or indirectly in its own initializer"):
inferring `adult`'s type needs `typeof Author`, which needs `adult`'s type. An explicit
annotation breaks the cycle (annotations are declared, not inferred):

```ts
export class Author extends AuthorCodegen {
  static adult:   Scope<Author, typeof Author> = scope(Author, (a) => a.age.gte(18));
  static popular: Scope<Author, typeof Author> = scope(Author, (a) => a.isPopular.eq(true));
  static named:   (p: string) => Scope<Author, typeof Author> =
    scope(Author, (p: string) => (a) => a.firstName.ilike(`${p}%`));
}
```

So we trade the hand-maintained `UserScopes` interface for a **uniform, name-free
annotation** repeated per field. Names are still discovered from `typeof Author` — adding
`static recent = …` makes `.recent` available on every other scope automatically, with no
interface to update.

### 5.3 Recommended sugar: a codegen'd one-line alias (still no names by hand)

To kill the verbose annotation, have codegen emit a single, name-free alias per entity
into `AuthorCodegen.ts` (it already builds that class via ts-poet):

```ts
// generated in AuthorCodegen.ts
export type AuthorScope = Scope<Author, typeof Author>;
```

Then hand-written code is just:

```ts
export class Author extends AuthorCodegen {
  static adult:   AuthorScope = scope(Author, (a) => a.age.gte(18));
  static popular: AuthorScope = scope(Author, (a) => a.isPopular.eq(true));
  static named = scope(Author, (p: string) => (a) => a.firstName.ilike(`${p}%`));
}
```

This is the closest achievable to "just `scope`": **no names interface, no per-name
codegen, literal `Author.adult.popular.where(...).find(em)`.** The alias is generated
once and never needs maintenance as scopes are added.

### 5.4 Primary technical risk — must verify before committing

`Scope<T, C>` is **recursive**: it embeds `C = typeof Author`, whose members are
themselves `Scope<T, C>`. TS resolves mapped-type property types lazily, and recursive
type aliases are normal (cf. JSON types), but this particular "map over `typeof Class`,
each member re-references the same mapped type" shape risks **ts2589 "type instantiation
is excessively deep and possibly infinite."**

This is unverified (verification was deferred). It is the **#1 thing to prototype** before
building anything else: a 30-line standalone `.ts` with two plain scopes + one
parameterized scope, asserting `Author.adult.popular.where(...).find(em)` type-checks and
`Author.bogus` errors.

**Fallback if the recursion doesn't hold:** generate per-name accessors + an explicit
interface (the `config.scope("adult", …)` route). User writes runtime registration only;
codegen owns all the types:

```ts
// Author.ts
config.scope("adult", (a) => a.age.gte(18));

// generated AuthorCodegen.ts
interface AuthorScopes { adult: Scope<Author, AuthorScopes>; /* … */ }
static get adult(): Scope<Author, AuthorScopes> { return scopeFor(Author, "adult"); }
```

This is heavier (codegen must learn scope names + parameter signatures, which means
parsing `config.scope(...)` calls or a declared manifest), but it sidesteps the recursive
`typeof Class` type entirely. Keep it in the back pocket.

## 6. Runtime: how the named accessors resolve

A scope object is a `Proxy` wrapping a `ScopeImpl`:

- Known builder/terminal keys (`where`, `orderBy`, `find`, …) hit the `ScopeImpl`
  prototype.
- Any other string key `name` is treated as a sibling scope: read `cstr[name]` (the other
  static field — that's where names live), take *its* ops, and return a new merged scope.
  - If `cstr[name]` is itself a scope (plain) → return `new ScopeImpl(meta, [...this.ops, { kind: "ref", name }])`.
  - If `cstr[name]` is a function (parameterized) → return `(...args) => new ScopeImpl(meta, [...this.ops, { kind: "ref", name, args }])`.

No separate registry is required: the class's own statics *are* the registry, both at the
type level (§5) and at runtime. `lookupNamedScope` in `toFindArgs` resolves a `ref` by
calling `cstr[name]` (with `args` if present) and reading its ops.

Idempotence: `Author.adult.adult` double-applies `age >= 18` (ANDed twice) — harmless,
just redundant SQL.

## 7. Parameterized scopes

```ts
static named = scope(Author, (prefix: string) => (a) => a.firstName.ilike(`${prefix}%`));
await Author.named("a").adult.find(em);
```

The factory's parameterized overload returns `(...args) => Scope<…>`. Inside a chain,
`.named("a")` is the function form of the accessor (§6), pushing `{ kind: "ref", name:
"named", args: ["a"] }`.

## 8. Composition details

- **Cross-scope reference** (Rails `scope :recent_adults, -> { adult.recent }`):
  ```ts
  static recentAdults: AuthorScope = scope(Author, ...).adult.orderBy({ createdAt: "DESC" }).limit(10);
  ```
  Stored as `ref` ops, resolved at compile with a cycle guard.
- **Default scope:** `config.defaultScope((a) => a.deletedAt.eq(null))` → ops prepended to
  every `toFindArgs`. (Soft-delete already does a narrower version; default scopes
  generalize it. Needs an opt-out, e.g. `.unscoped()`.)
- **`or` / `merge`:** future — `Author.adult.or(Author.popular)` emits an `{ or: [...] }`
  expression term combining each side's compiled conditions.

## 9. Association scopes — exploration (`author.books.published`)

**Verdict: feasible, and arguably nicer than static scopes**, because the owning entity
already carries an `em` — so association scopes don't need `em` passed in.

### 9.1 What it compiles to

`author.books.published` is a `Book` scope with the back-reference pinned:

```ts
// o2m: Author.books  → reverse field on Book is `author`
author.books.published.find()
  ≈ em.find(Book, { author: author, as: b }, { conditions: { and: [ published(b) ] } })
```

`em` comes from `author.em`; `.find()` takes **no argument**. Pinned filter by relation
kind:

| Relation on owner | Reverse filter on target |
| --- | --- |
| o2m `author.books` | `{ author: owner }` |
| m2m `author.tags` | `{ authors: owner }` (other side of the join) |
| o2o `author.image` | `{ author: owner }` |

### 9.2 Typing

The collection type gains the target entity's scope accessors, sourced from `typeof Book`:

```ts
// Collection<Author, Book> additionally exposes:
type CollectionScopes<U extends Entity> = {
  [K in ScopeNames<ConstructorOf<U>>]: /* same plain/parameterized split as §5, returning a Book scope */;
};
```

The wrinkle: `Collection<O, U>` only knows the *instance* type `U` (= `Book`), and §5
needs the *constructor* `typeof Book`. Joist's generated relations do have the target
constructor available at runtime (`otherMeta.cstr`); at the type level we'd need codegen
to thread `typeof Book` into the collection's type args (a generation change to the
relation declarations in `*Codegen.ts`). Without that, association-scope typing falls back
to the explicit-interface route (§5.4 fallback), which codegen could emit anyway.

### 9.3 Runtime

- Saved owner: pin `{ <reverseField>: owner }` and run `owner.em.find(Target, …)`.
- **Unsaved/new owner:** can't query by id. Options: (a) throw with a clear message; (b)
  filter the already-loaded collection in memory against the scope's predicates (only
  possible for simple column conditions, not relation-traversing ones); (c) use
  `findWithNewOrChanged` to union DB + WIP. Recommend (a) for v1, document (b)/(c) as
  follow-ups.
- Already-loaded collections: association scopes still issue a query (they're a *filtered*
  view, not a filter over the loaded array) unless we add an explicit in-memory mode.

### 9.4 Recommendation

Ship static (entity-level) scopes first. Land association scopes in a second phase: the
runtime is a thin pin-the-reverse-FK wrapper, but clean typing depends on threading the
target constructor type through generated relation declarations, and the new-owner
semantics need a decision. Keep `.find()`-without-`em` as the payoff that makes them worth
it.

## 10. Implementation phases

1. **Spike the recursive type (§5.4)** — standalone `.ts`, no engine. Gate the whole
   approach on this. If ts2589, switch to the §5.4 codegen fallback.
2. **Engine** — `ScopeImpl`, ops, `toFindArgs`, terminals. Pure library, unit-tested by
   asserting `toFindArgs()` output, then integration-tested against the Author/Book domain
   with `toMatchEntity`.
3. **`scope()` factory + Proxy + named-accessor resolution** (§6).
4. **Codegen alias** — emit `export type AuthorScope = Scope<Author, typeof Author>` per
   entity (§5.3).
5. **Default scopes** — `config.defaultScope` + `.unscoped()`.
6. **Association scopes** (§9) — relation-type threading + new-owner policy.
7. **`or`/`merge`** — later.

## 11. Open questions

1. Confirm the recursive `Scope<T, typeof Author>` type compiles without ts2589 (§5.4).
   Everything hinges on this.
2. Memoize the no-arg base scope (`Author.adult` returns the same object each access) or
   stay strictly fresh-per-access? Immutability says fresh; perf/identity says memoize the
   leaf and clone only on builder calls.
3. Same-field object-`where` stacking: silent last-wins, or detect collisions and reroute
   to ANDed conditions? (§3.2)
4. Default-scope opt-out spelling — `.unscoped()` vs an option on terminals.
5. Association scopes: throw vs in-memory vs `findWithNewOrChanged` for unsaved owners?
   (§9.3) And do we invest in threading `typeof Target` through generated relations for
   clean typing, or accept the interface fallback there?
