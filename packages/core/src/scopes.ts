import { type Alias } from "./Aliases";
import { maybeGetMetadataForType } from "./configure";
import type { Entity } from "./Entity";
import type {
  ExpressionCondition,
  ExpressionFilter,
  FilterAndSettings,
  FilterWithAlias,
  FindFilter,
} from "./EntityFilter";
import type { GraphQLFilterWithAlias } from "./EntityGraphQLFilter";
import type { EntityManager, FindFilterOptions, MaybeAbstractEntityConstructor } from "./EntityManager";
import type { Loaded, LoadHint } from "./loadHints";
import type { OrderOf } from "./typeMap";

/** A predicate expressed against a bound alias, i.e. `(a) => a.age.gte(18)`. */
export type AliasFn<T extends Entity> = (a: Alias<T>) => ExpressionCondition | ExpressionCondition[];

/**
 * The fluent builder to either a) terminate/invoke or b) chain scope methods.
 *
 * I.e. `Author.adult` is a ScopeQuery that can either do `.find` or `.popular`.
 *
 * This `ScopeQuery` is just the terminal/invocation methods, the `.popular` methods
 * are chained on via the `Scope` mapped type below.
 */
export interface ScopeQuery<T extends Entity> {
  /**
   * ANDs an ad-hoc filter onto the scope, i.e. `Author.adult.where({ firstName: "a1" })`.
   *
   * Accepts either a plain find filter (`{ field: value }`) or an alias callback
   * (`(a) => a.field.eq(value)`) and appends it to the recorded ops — multiple
   * `.where(...)` calls on the same field AND together rather than override.
   */
  where(where: FilterWithAlias<T>): this;
  where(fn: AliasFn<T>): this;

  /**
   * Appends an `orderBy` to the scope, i.e. `Author.adult.orderBy({ age: "DESC" })`.
   *
   * Chained `.orderBy(...)` calls **accumulate** (the resulting query has every recorded
   * orderBy in declaration order), unlike `.limit`/`.offset`/`.softDeletes` which are
   * last-wins. To replace an existing scope's ordering, pass `orderBy` to the terminal
   * `.find(em, { orderBy: ... })` instead — terminal options override the scope's.
   */
  orderBy(orderBy: OrderOf<T> | OrderOf<T>[]): this;

  /**
   * Sets the row limit on the scope, i.e. `Author.adult.limit(10)`.
   *
   * Chained `.limit(...)` calls are last-wins — only the most recent value survives compile.
   */
  limit(limit: number): this;

  /**
   * Sets the row offset on the scope, i.e. `Author.adult.offset(10)`.
   *
   * Chained `.offset(...)` calls are last-wins — only the most recent value survives compile.
   */
  offset(offset: number): this;

  /**
   * Overrides Joist's default soft-delete handling for this query, i.e.
   * `Author.adult.softDeletes("include")` to see soft-deleted rows.
   *
   * Chained `.softDeletes(...)` calls are last-wins. The effective value also gates
   * how `.where({ relation: ... })` filters that touch soft-delete-aware entities are
   * composed at compile time.
   */
  softDeletes(softDeletes: "include" | "exclude"): this;

  /**
   * Runs the scope against `em`, returning all matching rows.
   *
   * Terminal options (`orderBy`, `limit`, `offset`, `softDeletes`) passed here
   * **override** anything the scope recorded via `.orderBy(...)`, `.limit(...)`, etc.;
   * `conditions` passed here are ANDed with the scope's compiled conditions rather than
   * replacing them. To extend the scope's ordering instead of replacing it, chain
   * `.orderBy(...)` before `.find(em)`.
   */
  find(em: EntityManager): Promise<T[]>;
  find<const H extends LoadHint<T>>(
    em: EntityManager,
    opts?: FindFilterOptions<T> & { populate?: H },
  ): Promise<Loaded<T, H>[]>;

  /** Like {@link find} but returns a single match or `undefined`. Same options precedence as `find`. */
  findOne(em: EntityManager): Promise<T | undefined>;
  findOne<const H extends LoadHint<T>>(
    em: EntityManager,
    opts?: FindFilterOptions<T> & { populate?: H },
  ): Promise<Loaded<T, H> | undefined>;

  /** Like {@link findOne} but throws if no row matches. Same options precedence as `find`. */
  findOneOrFail(em: EntityManager): Promise<T>;
  findOneOrFail<const H extends LoadHint<T>>(
    em: EntityManager,
    opts?: FindFilterOptions<T> & { populate?: H },
  ): Promise<Loaded<T, H>>;

  /**
   * Returns the count of rows matching the scope.
   *
   * Recorded `orderBy`/`limit`/`offset` ops are dropped (they're meaningless for a count);
   * `softDeletes` and conditions still apply.
   */
  findCount(em: EntityManager): Promise<number>;

  /**
   * Returns the tagged ids of rows matching the scope.
   *
   * Like {@link findCount}, recorded `orderBy`/`limit`/`offset` ops are dropped.
   */
  findIds(em: EntityManager): Promise<string[]>;

  /**
   * Compiles the scope into Joist's `FilterAndSettings` shape for passing to other APIs
   * or for inspection in tests.
   *
   * Useful primarily for debugging — the returned shape captures whatever the terminal
   * `find` methods would have sent to `em.find`, before terminal-options precedence is
   * applied.
   */
  toFindArgs(): FilterAndSettings<T>;
}

/** A scope for entity `T`, with chainable named accessors supplied by `S`. */
export type Scope<T extends Entity, S = {}> = ScopeQuery<T> & S;

/**
 * A per-entity, pre-typed function for declaring scopes.
 *
 * I.e. this is the type of the `import { authorScope as scope }` that entity files
 * use to declare their scopes.
 *
 * Because of the `authorScope as scope` rename, we can bake into the API that this
 * is the Author entity, and so simplify its usage.
 */
export interface ScopeFn<T extends Entity, R extends Scope<T>> {
  /** Defines a scope based on a filter condition, i.e. `scope({ name: "John" })` or `scope(a => a.name.eq("John")`. */
  (arg: FilterWithAlias<T> | AliasFn<T>): R;
  /** Defines a parametrized filter, i.e. `scope(name => ({ name: { startsWith: name } }))`. */
  fn<A extends unknown[]>(fn: (...args: A) => FilterWithAlias<T> | AliasFn<T>): (...args: A) => R;
}

/** A scope fragment that can be expanded against any current query alias. */
export type ScopeFilterFragment<T extends Entity> =
  | { kind: "alias"; fn: AliasFn<T> }
  | { kind: "filter"; filter: FilterWithAlias<T> };

/**
 * Fully-expanded scope contents, with named refs resolved and settings collapsed.
 *
 * Deliberately *not* a `ParsedFindQuery`, even though they look adjacent: this is the pre-parse,
 * alias-free *input* we feed into `parseFindQuery`, not its alias-committed AST output. Two reasons
 * the distinction matters:
 * - `fragments` are un-parsed DSL — filter objects plus un-invoked `AliasFn` closures — so the same
 *   scope can be re-rooted onto the query's primary alias (`Author.adult.find(em)`) or onto a joined
 *   relation alias (`em.find(Book, { author: Author.adult })`). A `ParsedFindQuery` has already baked
 *   in concrete aliases like `a`/`b1` and could only be reused via alias-rewrite surgery.
 * - keeping `fragments` as a *list* (rather than one merged condition tree) preserves independent-EXISTS
 *   semantics: `.where({ books: ... }).where({ books: ... })` must stay two predicates — one EXISTS each —
 *   which a collapsed `ParsedFindQuery.condition` can no longer be split back into.
 */
export interface ResolvedScope<T extends Entity> {
  fragments: ScopeFilterFragment<T>[];
  orderBys: OrderOf<T>[];
  limit: number | undefined;
  offset: number | undefined;
  softDeletes: "include" | "exclude" | undefined;
}

interface EntityCstrResolver<T extends Entity> {
  entityType: string;
  /** Returns undefined while entity static fields run, before `configureMetadata` has populated the type map. */
  maybeGet(): MaybeAbstractEntityConstructor<T> | undefined;
}
type FindOptionsWithPopulate<T extends Entity> = FindFilterOptions<T> & { populate?: LoadHint<T> };

type ScopeOp<T extends Entity> =
  | ScopeFilterFragment<T>
  | { kind: "orderBy"; orderBy: OrderOf<T> | OrderOf<T>[] }
  | { kind: "limit"; limit: number }
  | { kind: "offset"; offset: number }
  | { kind: "softDeletes"; value: "include" | "exclude" }
  | { kind: "ref"; name: string; args?: unknown[] };

/** A named-scope reference captured during chaining, i.e. `.popular` in `Author.adult.popular`. */
type ScopeRefOp<T extends Entity> = Extract<ScopeOp<T>, { kind: "ref" }>;

// Use a symbol so stored scope fragments cannot collide with user-defined scope names.
const kOps = Symbol("scopeOps");
const kResolver = Symbol("scopeResolver");
const kWithScopeOp = Symbol("scopeWithOp");
// Symbol-keyed so it can't collide with a user's named scope (e.g. `Author.resolve`), which the
// proxy would otherwise treat as a chained ref.
const kResolve = Symbol("scopeResolve");

/** The internal-only view of a scope proxy: its symbol-keyed members, hidden from the public `Scope<T>`. */
type ScopeInternalApi<T extends Entity> = Scope<T> & {
  readonly [kOps]: ScopeOp<T>[];
  readonly [kResolver]: EntityCstrResolver<T>;
  [kResolve](): ResolvedScope<T>;
};

/** Creates a per-entity, pre-typed scope function. */
export function newScopeFn<T extends Entity, R extends Scope<T>>(entityType: string): ScopeFn<T, R> {
  // We won't immediately have access to the EntityMetadata during static field assignment, so provide a lazy handle
  const resolver: EntityCstrResolver<T> = {
    entityType,
    maybeGet: () => maybeGetMetadataForType<T>(entityType)?.cstr,
  };
  // Create the scopeFn
  function scopeFn(arg: FilterWithAlias<T> | AliasFn<T>): R {
    return newScope(resolver, [toOp(arg)]) as R;
  }
  // But then also add the `.fn(...)` for parameterized scopes
  scopeFn.fn = function scopeFn<A extends unknown[]>(fn: (...args: A) => FilterWithAlias<T> | AliasFn<T>): (...args: A) => R {
    return (...args) => newScope(resolver, [toOp(fn(...args))]) as R;
  };
  return scopeFn;
}

/** Returns true if `value` is one of our scope proxies. */
export function isScope<T extends Entity>(value: unknown): value is Scope<T> {
  // A scope is a callable Proxy (so parameterized refs like `Author.adult.named("a")` work), so it's
  // always `typeof === "function"`; that guard also keeps the `in` checks from throwing on primitives.
  return typeof value === "function" && kOps in value && kResolver in value;
}

/** Resolves a scope proxy into ordered filter fragments plus collapsed settings. */
export function resolveScope<T extends Entity>(scope: Scope<T>): ResolvedScope<T> {
  return asScopeInternalApi(scope)[kResolve]();
}

/**
 * Returns true for find filters that select every row of the entity type, i.e. an empty `{}` filter
 * or a scope that resolved to no fragments.
 *
 * Used by `em.findCount` and the count dataloader to short-circuit in-memory delete adjustments, which
 * are only safe when the query has no `where`/`conditions` to evaluate created/deleted entities against.
 */
export function isSelectAllFilter<T extends Entity>(
  where: FindFilter<T> | GraphQLFilterWithAlias<T>,
  conditions: ExpressionFilter | undefined,
): boolean {
  if (conditions !== undefined) return false;
  if (isScope<T>(where)) return resolveScope(where).fragments.length === 0;
  return Object.keys(where).length === 0;
}

/**
 * Creates an immutable scope proxy with `ops` as its current scope fragments.
 *
 * The proxy target is a function so the proxy is callable (for parameterized refs
 * like `Author.adult.named("a")`); unknown property accesses always record a `ref`
 * op, with validation against the entity constructor deferred until `compile` runs.
 */
function newScope<T extends Entity>(resolver: EntityCstrResolver<T>, ops: ScopeOp<T>[]): Scope<T> {
  const terminals = new ScopeTerminals(resolver, ops);
  function callable() {}
  Object.defineProperty(callable, kOps, { value: ops });
  Object.defineProperty(callable, kResolver, { value: resolver });
  return new Proxy(callable, {
    get(target, prop) {
      if (prop === kOps || prop === kResolver) return Reflect.get(target, prop);
      if (typeof prop === "symbol" || prop in terminals) {
        const value = Reflect.get(terminals, prop, terminals);
        return typeof value === "function" ? value.bind(terminals) : value;
      }
      // `await scope` probes `.then`; returning undefined lets await resolve to the scope itself
      // instead of treating the proxy as a thenable.
      if (prop === "then") return undefined;
      return newScope(resolver, [...ops, { kind: "ref", name: prop }]);
    },
    apply(_target, _thisArg, args: unknown[]) {
      // Invoked for chained parameterized refs, i.e. the `("a")` in `Author.adult.named("a")`.
      const lastOp = ops[ops.length - 1];
      if (lastOp?.kind !== "ref") throw new Error(`Scope is not parameterized`);
      return newScope(resolver, [...ops.slice(0, -1), { ...lastOp, args }]);
    },
  }) as unknown as Scope<T>;
}

/**
 * Concrete builder/terminal methods for a scope proxy.
 *
 * The outer proxy handles dynamic named-scope access like `.popular`; this class handles
 * fixed methods like `.where`, `.find`, and `.toFindArgs`.
 */
class ScopeTerminals<T extends Entity> {
  readonly #ops: ScopeOp<T>[];
  readonly #resolver: EntityCstrResolver<T>;

  constructor(resolver: EntityCstrResolver<T>, ops: ScopeOp<T>[]) {
    this.#resolver = resolver;
    this.#ops = ops;
  }

  get [kOps](): ScopeOp<T>[] {
    return this.#ops;
  }

  /** Flattens our recorded ops (resolving named refs, collapsing settings) into a {@link ResolvedScope}. */
  [kResolve](): ResolvedScope<T> {
    return resolveScopeOps(this.#resolver, this.#ops);
  }

  where(arg: FilterWithAlias<T> | AliasFn<T>): Scope<T> {
    return this[kWithScopeOp](toOp(arg));
  }

  orderBy(orderBy: OrderOf<T> | OrderOf<T>[]): Scope<T> {
    return this[kWithScopeOp]({ kind: "orderBy", orderBy });
  }

  limit(limit: number): Scope<T> {
    return this[kWithScopeOp]({ kind: "limit", limit });
  }

  offset(offset: number): Scope<T> {
    return this[kWithScopeOp]({ kind: "offset", offset });
  }

  softDeletes(value: "include" | "exclude"): Scope<T> {
    return this[kWithScopeOp]({ kind: "softDeletes", value });
  }

  toFindArgs(): FilterAndSettings<T> {
    return compile(this.#resolver, this.#ops);
  }

  find(em: EntityManager): Promise<T[]>;
  find<const H extends LoadHint<T>>(
    em: EntityManager,
    opts?: FindOptionsWithPopulate<T> & { populate?: H },
  ): Promise<Loaded<T, H>[]>;
  find(em: EntityManager, opts?: FindOptionsWithPopulate<T>): Promise<T[]> {
    const args = compile(this.#resolver, this.#ops);
    return em.find(resolveCstr(this.#resolver), args.where, toFindOptions(args, opts));
  }

  findOne(em: EntityManager): Promise<T | undefined>;
  findOne<const H extends LoadHint<T>>(
    em: EntityManager,
    opts?: FindOptionsWithPopulate<T> & { populate?: H },
  ): Promise<Loaded<T, H> | undefined>;
  findOne(em: EntityManager, opts?: FindOptionsWithPopulate<T>): Promise<T | undefined> {
    const args = compile(this.#resolver, this.#ops);
    return em.findOne(resolveCstr(this.#resolver), args.where, toFindOptions(args, opts));
  }

  findOneOrFail(em: EntityManager): Promise<T>;
  findOneOrFail<const H extends LoadHint<T>>(
    em: EntityManager,
    opts?: FindOptionsWithPopulate<T> & { populate?: H },
  ): Promise<Loaded<T, H>>;
  findOneOrFail(em: EntityManager, opts?: FindOptionsWithPopulate<T>): Promise<T> {
    const args = compile(this.#resolver, this.#ops);
    return em.findOneOrFail(resolveCstr(this.#resolver), args.where, toFindOptions(args, opts));
  }

  findCount(em: EntityManager): Promise<number> {
    const args = compile(this.#resolver, this.#ops);
    return em.findCount(resolveCstr(this.#resolver), args.where, toCountOptions(args));
  }

  findIds(em: EntityManager): Promise<string[]> {
    const args = compile(this.#resolver, this.#ops);
    return em.findIds(resolveCstr(this.#resolver), args.where, toCountOptions(args));
  }

  /** Returns a new scope with one more recorded operation. */
  [kWithScopeOp](op: ScopeOp<T>): Scope<T> {
    return newScope(this.#resolver, [...this.#ops, op]);
  }
}

/** Compiles the ordered scope ops into Joist's existing find args shape. */
function compile<T extends Entity>(resolver: EntityCstrResolver<T>, ops: ScopeOp<T>[]): FilterAndSettings<T> {
  const resolved = resolveScopeOps(resolver, ops);

  return {
    // A scope is a valid `FindFilter` `where`, so `em.find` re-parses & expands its fragments.
    where: newScope(resolver, resolved.fragments),
    orderBy: resolved.orderBys.length ? resolved.orderBys : undefined,
    limit: resolved.limit,
    offset: resolved.offset,
    softDeletes: resolved.softDeletes,
  };
}

/** Resolves ordered scope ops into filter fragments and root-only settings. */
function resolveScopeOps<T extends Entity>(resolver: EntityCstrResolver<T>, ops: ScopeOp<T>[]): ResolvedScope<T> {
  const fragments: ScopeFilterFragment<T>[] = [];
  const orderBys: OrderOf<T>[] = [];
  const refArgKeys = new WeakMap<object, number>();
  const nextRefArgKey = { value: 0 };
  let limit: number | undefined;
  let offset: number | undefined;
  let softDeletes: "include" | "exclude" | undefined;

  function expand(currentOps: ScopeOp<T>[], seen: Set<string>): void {
    for (const op of currentOps) {
      switch (op.kind) {
        case "alias":
        case "filter":
          fragments.push(op);
          break;
        case "orderBy":
          if (Array.isArray(op.orderBy)) orderBys.push(...op.orderBy);
          else orderBys.push(op.orderBy);
          break;
        case "limit":
          limit = op.limit;
          break;
        case "offset":
          offset = op.offset;
          break;
        case "softDeletes":
          softDeletes = op.value;
          break;
        case "ref": {
          const key = scopeRefKey(op, refArgKeys, nextRefArgKey);
          if (seen.has(key)) break;
          seen.add(key);
          expand(scopeOpsForRef(resolver, op), seen);
          break;
        }
      }
    }
  }

  expand(ops, new Set());
  return { fragments, orderBys, limit, offset, softDeletes };
}

/** Resolves a recorded named-scope ref to its underlying ops. */
function scopeOpsForRef<T extends Entity>(resolver: EntityCstrResolver<T>, op: ScopeRefOp<T>): ScopeOp<T>[] {
  const cstr = resolveCstr(resolver) as MaybeAbstractEntityConstructor<T> & Record<string, unknown>;
  const sibling = cstr[op.name];
  if (op.args) {
    // Scope proxies are also `typeof === "function"`, so explicitly reject them via `isScope`.
    if (typeof sibling !== "function" || isScope(sibling)) {
      throw new Error(`Scope ${resolver.entityType}.${op.name} is not parameterized`);
    }
    return scopeOpsFromValue(resolver, op.name, (sibling as (...args: unknown[]) => unknown)(...op.args));
  }
  return scopeOpsFromValue(resolver, op.name, sibling);
}

/** Extracts recorded scope ops from a resolved static field. */
function scopeOpsFromValue<T extends Entity>(
  resolver: EntityCstrResolver<T>,
  name: string,
  value: unknown,
): ScopeOp<T>[] {
  if (isScope<T>(value)) return asScopeInternalApi(value)[kOps];
  if (value === undefined) throw new Error(`Invalid scope ${resolver.entityType}.${name}`);
  if (typeof value === "function") throw new Error(`Scope ${resolver.entityType}.${name} requires arguments`);
  throw new Error(`${resolver.entityType}.${name} is not a scope`);
}

/** Creates a cycle key for named-scope refs without serializing arbitrary entities/functions. */
function scopeRefKey<T extends Entity>(
  op: ScopeRefOp<T>,
  refArgKeys: WeakMap<object, number>,
  nextRefArgKey: { value: number },
): string {
  return op.args
    ? `${op.name}(${op.args.map((arg) => scopeRefArgKey(arg, refArgKeys, nextRefArgKey)).join(",")})`
    : op.name;
}

/** Creates a stable per-resolution key for one named-scope argument. */
function scopeRefArgKey(arg: unknown, refArgKeys: WeakMap<object, number>, nextRefArgKey: { value: number }): string {
  if ((typeof arg === "object" && arg !== null) || typeof arg === "function") {
    let key = refArgKeys.get(arg);
    if (key === undefined) {
      key = nextRefArgKey.value;
      nextRefArgKey.value += 1;
      refArgKeys.set(arg, key);
    }
    return `${typeof arg}:${key}`;
  }
  return `${typeof arg}:${JSON.stringify(String(arg))}`;
}

/** Narrows a known scope proxy to its internal-only (symbol-keyed) API. */
function asScopeInternalApi<T extends Entity>(scope: Scope<T>): ScopeInternalApi<T> {
  if (!isScope(scope)) throw new Error("Invalid scope");
  return scope as ScopeInternalApi<T>;
}

/** Resolves the lazy entity constructor. */
function resolveCstr<T extends Entity>(resolver: EntityCstrResolver<T>): MaybeAbstractEntityConstructor<T> {
  const cstr = resolver.maybeGet();
  if (cstr === undefined) throw new Error(`Unknown type ${resolver.entityType}`);
  return cstr;
}

/** Converts a scope declaration argument into a recorded op. */
function toOp<T extends Entity>(arg: FilterWithAlias<T> | AliasFn<T>): ScopeOp<T> {
  return typeof arg === "function"
    ? { kind: "alias", fn: arg as AliasFn<T> }
    : { kind: "filter", filter: arg as FilterWithAlias<T> };
}

/**
 * Pulls the option half of `FilterAndSettings` back out for `em.find`.
 *
 * The scope's recorded settings are the defaults; terminal `opts` (orderBy/limit/offset/conditions/
 * populate) override. The scope itself carries no `conditions` — it compiles to a `where` scope that
 * `em.find` expands — so the only conditions are the caller's, which flow through the `...opts` spread.
 */
function toFindOptions<T extends Entity>(
  args: FilterAndSettings<T>,
  opts?: FindOptionsWithPopulate<T>,
): FindOptionsWithPopulate<T> {
  return { orderBy: args.orderBy, limit: args.limit, offset: args.offset, softDeletes: args.softDeletes, ...opts };
}

/** Like `toFindOptions`, but drops the `orderBy`/`limit`/`offset` that `findCount`/`findIds` ignore. */
function toCountOptions<T extends Entity>(args: FilterAndSettings<T>): FindFilterOptions<T> {
  return { softDeletes: args.softDeletes };
}
