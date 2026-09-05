import type { ExpressionCondition } from "./EntityFilter.ts";
import type { EntityMetadata } from "./EntityMetadata.ts";
import { safeKq } from "./keywords.ts";
import type { ColumnCondition, RawCondition } from "./QueryParser.ts";

/**
 * The shared expression protocol for `em.query`.
 *
 * Alias columns (`a.firstName`), aggregates (`b.id.count()`), `sql` templates, subquery columns
 * (`bookStats.bookCount`), and scalar subqueries all implement it, so any of them can appear in
 * `select`, `where`, `groupBy`, `having`, `orderBy`, and inside other expressions.
 *
 * This module is a leaf on purpose: `Aliases.ts` extends `BaseExpr` at load time, so nothing here may
 * import (at runtime) a module that leads back to `Aliases.ts`. Anything that needs metadata, alias
 * binding, or SQL generation for conditions is reached through the `ExprContext` the query parser passes in.
 */

export const exprBrand: unique symbol = Symbol("joist.expr");

/**
 * Phantom type information carried by every `Expr`.
 *
 * `R` is the decoded result type.
 *
 * `Src` is the expression's *source key*: the type-level identity of the table it reads from. An entity
 * alias's key is its type name (`alias(Author)` gives `"Author"`) or the explicit name in
 * `alias(Author, "m")`; a subquery's key is its `as: "book_stats"`, or the shared sentinel `"?"` when it
 * has no `as`. Exactly two questions are asked of a source key, and nothing else:
 *
 * - `MaybeNull` asks "is my source key among the LEFT-joined sources in this query's join list?" If yes,
 *   the value can be `null`.
 * - `CheckScope` asks "is my source key among `from` + `join` at all?" If no, the query reads from a
 *   table it never joined.
 *
 * Two special keys opt out of both questions:
 *
 * - `Expr<number, never>` reads from nothing that can be left-joined away, i.e. `b.id.count()`
 * - `Expr<number, string>` (the default) is untracked, i.e. `sql.ref` on an unknown table
 */
export interface ExprBrand<R, Src extends string> {
  readonly __result: R;
  readonly __source: Src;
}

/**
 * "Any expression whose result is `R`", checked by brand alone.
 *
 * Method parameters use this instead of `Expr<R>` so that `Expr` stays covariant in `R`: checking
 * `Expr<AuthorId>` against `Expr<AuthorId | null>` then only compares the phantom `__result`, not every
 * method's parameter list (which would make `Expr` invariant, and break `select: b.author` dispatch and
 * polymorphic joins).
 */
export type ExprLike<R> = { readonly [exprBrand]: ExprBrand<R, any> };

/**
 * A typed SQL expression: an alias column, an aggregate, a `sql` template, or a scalar subquery.
 *
 * Conditions and SQL functions are methods, so they need no import. Aggregates keep `Src` so scope
 * checking still sees through `bs.x.max()`; `count` is source-less because `count(x)` is 0, not null,
 * when `x`'s table is left-joined away; `coalesce` drops `Src` on purpose, since its whole job is to
 * remove the nullability a left join adds.
 */
export interface Expr<R, Src extends string = string> {
  readonly [exprBrand]: ExprBrand<R, Src>;
  eq(value: R | ExprLike<R> | undefined): ExpressionCondition;
  ne(value: R | ExprLike<R> | undefined): ExpressionCondition;
  gt(value: R | ExprLike<R> | undefined): ExpressionCondition;
  gte(value: R | ExprLike<R> | undefined): ExpressionCondition;
  lt(value: R | ExprLike<R> | undefined): ExpressionCondition;
  lte(value: R | ExprLike<R> | undefined): ExpressionCondition;
  // A list subquery may select a nullable column; NULLs in the set never match, so that is fine.
  in(values: readonly R[] | ExprLike<R | null> | undefined): ExpressionCondition;
  nin(values: readonly R[] | ExprLike<R | null> | undefined): ExpressionCondition;

  /** `count(x)::int`; `count(a.id)` is `count(*)` for the FROM table, and the matched-row count for a left-joined one. */
  count(): Expr<number, never>;
  countDistinct(): Expr<number, never>;
  sum(this: Expr<number | null, Src>): Expr<number | null, Src>;
  avg(this: Expr<number | null, Src>): Expr<number | null, Src>;
  min(): Expr<R | null, Src>;
  max(): Expr<R | null, Src>;
  /** PG keeps element NULLs (a left-joined empty group aggregates as `[null]`), and zero rows aggregate as NULL. */
  arrayAgg(): Expr<R[] | null, Src>;
  stringAgg(this: Expr<string | null, Src>, delimiter: string): Expr<string | null, Src>;
  coalesce(fallback: NonNullable<R>): Expr<NonNullable<R>, never>;
}

/**
 * A marker condition that `eq`/`in`/etc. return for an `undefined` value, so the condition prunes away.
 *
 * It lives here (not `QueryParser.ts`) so `Expr.ts` stays a runtime leaf: `Aliases.ts` extends `BaseExpr`
 * at load time, so this module must not (transitively) load `Aliases.ts` back. For the same reason its
 * `QueryParser.ts`/`EntityFilter.ts` imports use `import type`, which is fully erased - a `{ type X }`
 * import keeps a side-effect module load under `verbatimModuleSyntax`.
 */
export const skipCondition: ColumnCondition = {
  kind: "column",
  alias: "skip",
  column: "skip",
  dbType: "skip",
  cond: undefined as any,
};

/**
 * A join entry: the join kind is the key, the joined source is the value, plus `on`. `inner?: never` /
 * `left?: never` keep an entry to one kind (the `ExpressionFilter` `and`/`or` trick).
 *
 * `on` is required. A join is pruned when nothing references it anymore, not by an `undefined` ON;
 * `keep: true` pins a join that would otherwise prune, i.e. an inner join used as an existence filter,
 * the way em.find's `keepAliases` does. It is a boolean so callers can pass a flag.
 *
 * Declared here (not `query.ts`) so the relation join factories in `Aliases.ts` (i.e. `a.books.as(b)`) can
 * return them without importing `query.ts`; `query.ts` re-constrains `A` to its `QuerySource`.
 */
export interface InnerJoin<A> {
  readonly inner: A;
  readonly left?: never;
  readonly on: ExpressionCondition;
  readonly keep?: boolean;
}

export interface LeftJoin<A> {
  readonly left: A;
  readonly inner?: never;
  readonly on: ExpressionCondition;
  readonly keep?: boolean;
}

/** SQL plus its `?` bindings plus the SQL aliases it references, i.e. for join pruning. */
export interface SqlFragment {
  sql: string;
  bindings: any[];
  refs: string[];
}

/**
 * What an expression needs from the query it is generating SQL for: the SQL alias assigned to each
 * source, and a way to turn nested conditions into SQL (which needs `ConditionBuilder`, so it lives in `query.ts`).
 */
export interface ExprContext {
  /** Returns the SQL alias for an alias's `AliasMgmt` or a subquery handle, searching enclosing queries. */
  aliasFor(handle: object): string;
  /** Turns a user-facing condition into SQL; `undefined` if it pruned away entirely. */
  conditionToSql(cond: ExpressionCondition): SqlFragment | undefined;
}

/** The runtime half of the `Expr` protocol. */
export interface ExprNode {
  /** Produces this expression's SQL so it can be embedded in a larger expression, i.e. a subquery gets parens. */
  toSql(ctx: ExprContext): SqlFragment;
  /** Converts a result-set value into the domain value, i.e. an int into a tagged id. */
  decode(value: unknown): unknown;
  /** Converts a domain value into the database value, i.e. a tagged id into an int, for bindings. */
  encode(value: unknown): unknown;
}

export function isExpr(value: unknown): value is ExprLike<any> {
  return typeof value === "object" && value !== null && exprBrand in value;
}

/** Every `Expr` is a `BaseExpr` at runtime; this cast keeps `isExpr` a plain type guard so unions narrow. */
export function asNode(expr: ExprLike<any>): BaseExpr {
  return expr as any as BaseExpr;
}

export const deferredAliasSym: unique symbol = Symbol("joist.deferredAliasCondition");

/** Resolves an alias handle (its `AliasMgmt`) to this parse's binding: the bound meta and SQL alias. */
export type AliasResolver = (handle: object) => { meta: EntityMetadata; alias: string };

/**
 * A `ColumnCondition`/`RawCondition` whose alias(es) are re-resolved on every parse.
 *
 * Alias columns create conditions before any parser assigns SQL aliases, so the condition carries a
 * resolve function instead of a baked-in alias: `em.find` resolves with its join-literal bindings, and
 * `em.query` resolves through the `ExprContext`, whose `aliasFor` also records the ref for pruning and
 * correlation. Resolving recomputes from scratch, so one condition works across queries whose alias
 * assignments differ.
 */
export interface DeferredAliasCondition {
  [deferredAliasSym]: (resolve: AliasResolver) => void;
}

export function isDeferredAliasCondition(cond: unknown): cond is DeferredAliasCondition {
  return typeof cond === "object" && cond !== null && deferredAliasSym in cond;
}

/** Tags `cond` with its per-parse resolve function, non-enumerable so the condition still deep-equals as data. */
export function withDeferredAlias<C extends object>(
  cond: C,
  resolve: (r: AliasResolver) => void,
): C & DeferredAliasCondition {
  return Object.defineProperty(cond, deferredAliasSym, { value: resolve, enumerable: false }) as any;
}

export const deferredSym: unique symbol = Symbol("joist.deferredCondition");

/**
 * A condition whose SQL depends on aliases that are only known once the query is parsed, i.e.
 * `bookStats.bookCount.gt(1)` or `bs.authorId.eq(a.id)`.
 *
 * It is shaped like a `RawCondition` so it can sit in any `ExpressionFilter`; `resolveDeferredConditions`
 * fills in `condition`, `bindings`, and `aliases` before the filter is parsed. Alias columns compared to
 * literals keep producing `ColumnCondition`s (the `em.find` path), so this is only for comparisons that
 * involve a non-alias expression.
 */
export interface DeferredCondition extends RawCondition {
  [deferredSym]: (ctx: ExprContext) => void;
}

export function isDeferredCondition(cond: unknown): cond is DeferredCondition {
  return typeof cond === "object" && cond !== null && deferredSym in cond;
}

/** Creates a `DeferredCondition` that generates its SQL with `fn` once the query's aliases are known. */
export function deferredCondition(fn: (ctx: ExprContext) => SqlFragment): DeferredCondition {
  const cond: DeferredCondition = {
    kind: "raw",
    aliases: [],
    condition: "<unresolved>",
    bindings: [],
    pruneable: false,
    [deferredSym]: (ctx) => {
      const { sql, bindings, refs } = fn(ctx);
      cond.condition = sql;
      cond.bindings = bindings;
      cond.aliases = refs;
    },
  };
  return cond;
}

/** Walks an `ExpressionCondition` tree and resolves every deferred condition in place. */
export function resolveDeferredConditions(cond: ExpressionCondition | undefined, ctx: ExprContext): void {
  if (cond === undefined || cond === null) return;
  if (isDeferredCondition(cond)) {
    cond[deferredSym](ctx);
  } else if (isDeferredAliasCondition(cond)) {
    cond[deferredAliasSym](ctxResolver(ctx));
  } else if ("and" in cond && cond.and) {
    for (const c of cond.and) resolveDeferredConditions(c, ctx);
  } else if ("or" in cond && cond.or) {
    for (const c of cond.or) resolveDeferredConditions(c, ctx);
  }
}

/** An `AliasResolver` backed by an `ExprContext`; a handle's bound meta is its own (`em.query` sources are their own tables). */
function ctxResolver(ctx: ExprContext): AliasResolver {
  return function resolve(handle: object) {
    return { meta: (handle as any).meta, alias: ctx.aliasFor(handle) };
  };
}

/** Concatenates SQL fragments with `sep`, keeping bindings and refs in order. */
export function joinFragments(parts: SqlFragment[], sep: string): SqlFragment {
  return {
    sql: parts.map((p) => p.sql).join(sep),
    bindings: parts.flatMap((p) => p.bindings),
    refs: parts.flatMap((p) => p.refs),
  };
}

/**
 * The methods every expression shares. Subclasses provide `toSql`, and usually `decode`/`encode`.
 *
 * Alias columns override the comparison methods with the `em.find` `ColumnCondition` path when the
 * right-hand side is a literal, and fall back to these for expression-vs-expression comparisons.
 */
export abstract class BaseExpr implements ExprNode {
  readonly [exprBrand]: any = this;
  /** True for scalar subqueries, whose `IN (...)` form must not get a second set of parens. */
  readonly isSubquery: boolean = false;

  abstract toSql(ctx: ExprContext): SqlFragment;

  /** Produces the SQL without the outer parens a subquery normally gets; only differs for subqueries. */
  toSqlBare(ctx: ExprContext): SqlFragment {
    return this.toSql(ctx);
  }

  decode(value: unknown): unknown {
    return value;
  }

  encode(value: unknown): unknown {
    return value;
  }

  eq(value: unknown): ExpressionCondition {
    return this.compare("=", value);
  }

  ne(value: unknown): ExpressionCondition {
    return this.compare("!=", value);
  }

  gt(value: unknown): ExpressionCondition {
    return this.compare(">", value);
  }

  gte(value: unknown): ExpressionCondition {
    return this.compare(">=", value);
  }

  lt(value: unknown): ExpressionCondition {
    return this.compare("<", value);
  }

  lte(value: unknown): ExpressionCondition {
    return this.compare("<=", value);
  }

  in(values: unknown): ExpressionCondition {
    return this.inList("IN", values);
  }

  nin(values: unknown): ExpressionCondition {
    return this.inList("NOT IN", values);
  }

  count(): Expr<number, never> {
    return new FnExpr("count", [this], { suffix: "::int", decode: decodeNumber, encode: identity }) as any;
  }

  countDistinct(): Expr<number, never> {
    return new FnExpr("count", [this], {
      prefix: "DISTINCT ",
      suffix: "::int",
      decode: decodeNumber,
      encode: identity,
    }) as any;
  }

  sum(): Expr<number | null, any> {
    return new FnExpr("sum", [this], { decode: decodeNumber, encode: identity }) as any;
  }

  avg(): Expr<number | null, any> {
    return new FnExpr("avg", [this], { decode: decodeNumber, encode: identity }) as any;
  }

  min(): Expr<any, any> {
    return new FnExpr("min", [this], { decode: (v) => this.decode(v) }) as any;
  }

  max(): Expr<any, any> {
    return new FnExpr("max", [this], { decode: (v) => this.decode(v) }) as any;
  }

  arrayAgg(): Expr<any, any> {
    // Values are arrays while the argument encodes/decodes *elements*, i.e. a `.coalesce(["b:1"])`
    // fallback must encode each tagged id, not hand the whole array to the id column's encoder
    return new FnExpr("array_agg", [this], {
      decode: (v) => (Array.isArray(v) ? v.map((e) => this.decode(e)) : v),
      encode: (v) => (Array.isArray(v) ? v.map((e) => this.encode(e)) : v),
    }) as any;
  }

  stringAgg(delimiter: string): Expr<string | null, any> {
    return new FnExpr("string_agg", [this, new BindingExpr(delimiter)], {}) as any;
  }

  coalesce(fallback: unknown): Expr<any, never> {
    return new FnExpr("coalesce", [this, new BindingExpr(this.encode(fallback))], {
      decode: (v) => this.decode(v),
    }) as any;
  }

  /** `this op value`, where `value` may be `undefined` (pruned), `null`, another expression, or a literal. */
  protected compare(op: string, value: unknown): ExpressionCondition {
    if (value === undefined) return skipCondition;
    if (value === null) {
      const not = op === "=" ? "" : op === "!=" ? "NOT " : fail(`Cannot compare ${op} to null`);
      return deferredCondition((ctx) => {
        const left = this.toSql(ctx);
        return { ...left, sql: `${left.sql} IS ${not}NULL` };
      });
    }
    if (isExpr(value)) {
      return deferredCondition((ctx) => joinFragments([this.toSql(ctx), asNode(value).toSql(ctx)], ` ${op} `));
    }
    return deferredCondition((ctx) => {
      const left = this.toSql(ctx);
      return { sql: `${left.sql} ${op} ?`, bindings: [...left.bindings, this.encode(value)], refs: left.refs };
    });
  }

  /** `this IN (subquery)` or `this = ANY(?)` for a list; `NOT IN` / `!= ALL(?)` for `nin`. */
  protected inList(op: "IN" | "NOT IN", values: unknown): ExpressionCondition {
    if (values === undefined) return skipCondition;
    if (isExpr(values)) {
      return deferredCondition((ctx) => {
        const left = this.toSql(ctx);
        const right = asNode(values).toSqlBare(ctx);
        return joinFragments([left, { ...right, sql: `(${right.sql})` }], ` ${op} `);
      });
    }
    if (!Array.isArray(values)) fail(`Expected an array or subquery for ${op}, got ${values}`);
    const fn = op === "IN" ? "= ANY(?)" : "!= ALL(?)";
    return deferredCondition((ctx) => {
      const left = this.toSql(ctx);
      return {
        sql: `${left.sql} ${fn}`,
        bindings: [...left.bindings, values.map((v) => this.encode(v))],
        refs: left.refs,
      };
    });
  }
}

/**
 * A SQL function applied to expressions, i.e. `count(a."id")::int` or `coalesce(bs."n", ?)`.
 *
 * By default the result decodes/encodes like the first argument (`max(a.id)` is still an id); numeric
 * aggregates pass their own `decode`/`encode`, since `count(a.id)` is a number, not an id.
 */
export class FnExpr extends BaseExpr {
  constructor(
    private name: string,
    private args: BaseExpr[],
    private opts: {
      prefix?: string;
      suffix?: string;
      decode?: (value: unknown) => unknown;
      encode?: (value: unknown) => unknown;
    },
  ) {
    super();
  }

  toSql(ctx: ExprContext): SqlFragment {
    const args = joinFragments(
      this.args.map((a) => a.toSql(ctx)),
      ", ",
    );
    return { ...args, sql: `${this.name}(${this.opts.prefix ?? ""}${args.sql})${this.opts.suffix ?? ""}` };
  }

  decode(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    return this.opts.decode ? this.opts.decode(value) : value;
  }

  encode(value: unknown): unknown {
    return this.opts.encode ? this.opts.encode(value) : this.args[0].encode(value);
  }
}

/** A bound literal, i.e. the `?` in `coalesce(x, ?)`. */
export class BindingExpr extends BaseExpr {
  constructor(private value: unknown) {
    super();
  }

  toSql(): SqlFragment {
    return { sql: "?", bindings: [this.value], refs: [] };
  }
}

/** An unmodeled column on a known source, i.e. `sql.ref(a, "ts_search")`; untracked at the type level. */
export class RefExpr extends BaseExpr {
  constructor(
    private handle: object,
    private column: string,
  ) {
    super();
  }

  toSql(ctx: ExprContext): SqlFragment {
    const alias = ctx.aliasFor(this.handle);
    // safeKq for both halves: sql.ref takes user strings, and a subquery alias is its `as` name
    return { sql: `${safeKq(alias)}.${safeKq(this.column)}`, bindings: [], refs: [alias] };
  }
}

/**
 * A `sql` tagged template.
 *
 * Interpolated expressions use the alias Joist assigned, conditions become SQL, and every
 * other value becomes a `?` binding, so users never write `"a.age * 2"` and hope `a` is the SQL alias.
 */
export class TemplateExpr extends BaseExpr {
  constructor(
    private strings: TemplateStringsArray,
    private values: unknown[],
  ) {
    super();
  }

  toSql(ctx: ExprContext): SqlFragment {
    const parts: SqlFragment[] = [];
    this.strings.forEach((s, i) => {
      parts.push({ sql: s, bindings: [], refs: [] });
      if (i < this.values.length) parts.push(interpolationToSql(this.values[i], ctx));
    });
    return joinFragments(parts, "");
  }
}

/** Turns one `${...}` of a `sql` template into SQL: an expression, a condition, or a bound value. */
export function interpolationToSql(value: unknown, ctx: ExprContext): SqlFragment {
  if (isExpr(value)) {
    return asNode(value).toSql(ctx);
  } else if (isConditionLike(value)) {
    return ctx.conditionToSql(value as ExpressionCondition) ?? { sql: "true", bindings: [], refs: [] };
  } else {
    return { sql: "?", bindings: [value], refs: [] };
  }
}

/** True for the user-facing condition shapes: `{ and }`, `{ or }`, `ColumnCondition`, `RawCondition`. */
export function isConditionLike(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as any;
  return "and" in v || "or" in v || v.kind === "column" || v.kind === "raw" || v.kind === "exists";
}

/** Decodes `count`/`sum`/`avg` results, which Postgres returns as strings for bigint/numeric. */
function decodeNumber(value: unknown): unknown {
  return typeof value === "string" ? Number(value) : value;
}

function identity(value: unknown): unknown {
  return value;
}

function fail(message: string): never {
  throw new Error(message);
}
