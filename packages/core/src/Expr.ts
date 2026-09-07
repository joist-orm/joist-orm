import type { ExpressionCondition } from "./EntityFilter.ts";
import type { EntityMetadata } from "./EntityMetadata.ts";
import { safeKq } from "./keywords.ts";
import type { RawCondition } from "./QueryParser.ts";
import { skipCondition } from "./skipCondition.ts";

/**
 * The shared expression protocol for `em.query`.
 *
 * Table columns (`a.first_name`), aggregates (`b.id.count()`), `sql` templates, subquery columns
 * (`bookStats.bookCount`), and scalar subqueries all implement it, so any of them can appear in
 * `select`, `where`, `groupBy`, `having`, `orderBy`, and inside other expressions.
 *
 * This module is a leaf on purpose: `Tables.ts` extends `BaseExpr` at load time, so nothing here may
 * import (at runtime) a module that leads back to `Tables.ts`. Anything that needs metadata, alias
 * binding, or SQL generation for conditions is reached through the `ExprContext` the query parser passes in.
 */

export const exprBrand: unique symbol = Symbol("joist.expr");

/**
 * Phantom type information carried by every `Expr`.
 *
 * `R` is the decoded result type.
 *
 * `Src` is the expression's *source key*: the type-level identity of the table it reads from. An entity
 * table's key is its type name (`table(Author)` gives `"Author"`) or the explicit name in
 * `table(Author, "m")`; a subquery's key is its `as: "book_stats"`, or the shared sentinel `"?"` when it
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
 * Runtime type information that lets set operations reject outputs that cannot safely share conversions.
 *
 * PostgreSQL compares projected SQL rows and chooses a common SQL type before Joist decodes them.
 * A compound uses one decoder per output column and retains an encoder for later comparisons and
 * coalesce fallbacks. We must check every operand before reusing the first operand's conversions:
 * TypeScript result types are erased, and equal SQL storage types do not imply equal logical domains.
 *
 * I.e. Author.id and Book.author_id are compatible Author IDs despite having separate serdes, while
 * Book.id must not compare or decode as an Author ID just because both use int4. Conversely, Author.age
 * and Author.age.sum() both expose TypeScript numbers but produce int4 and int8 driver values. Without
 * their SQL type information, accepting them could make decoding depend on which operand comes first.
 * Enum, custom-mapper, and JSON-schema domain tokens also prevent unrelated conversions from mixing.
 *
 * Compatibility requires exact equality of the canonical SQL `dbType`, the `domain` token, and
 * `idMeta`. An absent descriptor is unknown, not an identity codec. `idMeta` identifies scalar IDs only;
 * arrays retain their element domain separately so they cannot select a polymorphic IN component.
 * Raw `sql<R>` annotations do not supply this runtime information. Encoding and decoding remain on the
 * expression; this descriptor only holds the information needed for these conservative checks.
 */
export interface ExprOutputType {
  dbType: string;
  domain: unknown;
  idMeta?: EntityMetadata;
  /** Internal conversion proof, consistent for equal dbType/domain/idMeta; not another compatibility key. */
  arrayElementSafe?: boolean;
}

/**
 * "Any expression whose result is `R`", checked by brand alone.
 *
 * Method parameters use this instead of `Expr<R>` so that `Expr` stays covariant in `R`: checking
 * `Expr<AuthorId>` against `Expr<AuthorId | null>` then only compares the phantom `__result`, not every
 * method's parameter list (which would make `Expr` invariant, and break `select: b.author_id` dispatch and
 * polymorphic joins).
 */
export type ExprLike<R> = { readonly [exprBrand]: ExprBrand<R, any> };

/**
 * A typed SQL expression: a table column, an aggregate, a `sql` template, or a scalar subquery.
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
 * A join entry: the join kind is the key, the joined source is the value, plus `on`. `inner?: never` /
 * `left?: never` keep an entry to one kind (the `ExpressionFilter` `and`/`or` trick).
 *
 * `on` is required. A join is pruned when nothing references it anymore, not by an `undefined` ON;
 * `keep: true` pins a join that would otherwise prune, i.e. an inner join used as an existence filter,
 * the way em.find's `keepAliases` does. It is a boolean so callers can pass a flag.
 *
 * Declared here (not `query.ts`) so the relation join factories in `Tables.ts` (i.e. `a.books.as(b)`) can
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
  /** Returns the SQL alias for a table's `TableMgmt` or a subquery handle, searching enclosing queries. */
  aliasFor(handle: object): string;
  /** Turns a user-facing condition into SQL; `undefined` if it pruned away entirely. */
  conditionToSql(cond: ExpressionCondition): SqlFragment | undefined;
}

export function isExpr(value: unknown): value is ExprLike<any> {
  return typeof value === "object" && value !== null && exprBrand in value;
}

/** Every `Expr` is a `BaseExpr` at runtime; this cast keeps `isExpr` a plain type guard so unions narrow. */
export function asNode(expr: ExprLike<any>): BaseExpr {
  return expr as any as BaseExpr;
}

export const deferredSym: unique symbol = Symbol("joist.deferredCondition");

/**
 * A condition whose SQL depends on aliases that are only known once the query is parsed, i.e.
 * `bookStats.bookCount.gt(1)` or `bs.authorId.eq(a.id)`.
 *
 * It is shaped like a `RawCondition` so it can sit in any `ExpressionFilter`; `resolveDeferredConditions`
 * snapshots `condition`, `bindings`, and `aliases` before the filter is parsed. Domain alias conditions
 * use a separate protocol in the `em.find` parser.
 */
export interface DeferredCondition extends RawCondition {
  [deferredSym]: (ctx: ExprContext) => RawCondition;
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
      return { ...cond, condition: sql, bindings, aliases: refs };
    },
  };
  return cond;
}

/**
 * Resolve each condition occurrence and snapshot it before resolving the next one. A nested subquery
 * may reuse the same condition under another alias; it must not overwrite this occurrence's SQL.
 */
export function resolveDeferredConditions(
  cond: ExpressionCondition | undefined,
  ctx: ExprContext,
): ExpressionCondition | undefined {
  if (cond === undefined || cond === null) return cond;
  if (isDeferredCondition(cond)) {
    return cond[deferredSym](ctx);
  } else if ("and" in cond && cond.and) {
    return { ...cond, and: cond.and.map((c) => resolveDeferredConditions(c, ctx)) };
  } else if ("or" in cond && cond.or) {
    return { ...cond, or: cond.or.map((c) => resolveDeferredConditions(c, ctx)) };
  }
  return cond;
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
 * Table columns can override comparisons to apply column-specific conversions. Domain aliases do not
 * implement this protocol.
 */
export abstract class BaseExpr {
  readonly [exprBrand]: any = this;

  /** Produces this expression's SQL so it can be embedded in a larger expression, i.e. a subquery gets parens. */
  abstract toSql(ctx: ExprContext): SqlFragment;

  /** Only an actual scalar/IN subquery exposes its selected expression, not an ordinary ID expression. */
  get subquerySelect(): BaseExpr | undefined {
    return undefined;
  }

  /** Known SQL representation and logical domain; raw SQL and unmodeled refs remain unknown. */
  get outputType(): ExprOutputType | undefined {
    return undefined;
  }

  /** Physical SQL nullability; undefined means unknown, not a NOT NULL guarantee. */
  get sqlNullable(): boolean | undefined {
    return undefined;
  }

  /** The source of a direct column reference, whose value becomes NULL under an unmatched LEFT join. */
  get sqlSource(): object | undefined {
    return undefined;
  }

  /** Produces the SQL without the outer parens a subquery normally gets; only differs for subqueries. */
  toSqlBare(ctx: ExprContext): SqlFragment {
    return this.toSql(ctx);
  }

  /** Converts a result-set value into the domain value, i.e. an int into a tagged id. */
  decode(value: unknown): unknown {
    return value;
  }

  /** Converts a domain value into the database value, i.e. a tagged id into an int, for bindings. */
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
    return new FnExpr("count", [this], {
      suffix: "::int",
      decode: decodeNumber,
      encode: identity,
      outputType: { dbType: "int4", domain: Number, arrayElementSafe: true },
    }) as any;
  }

  countDistinct(): Expr<number, never> {
    return new FnExpr("count", [this], {
      prefix: "DISTINCT ",
      suffix: "::int",
      decode: decodeNumber,
      encode: identity,
      outputType: { dbType: "int4", domain: Number, arrayElementSafe: true },
    }) as any;
  }

  sum(): Expr<number | null, any> {
    return new FnExpr("sum", [this], {
      decode: decodeNumber,
      encode: identity,
      outputType: numericAggregateOutputType("sum", this.outputType),
    }) as any;
  }

  avg(): Expr<number | null, any> {
    return new FnExpr("avg", [this], {
      decode: decodeNumber,
      encode: identity,
      outputType: numericAggregateOutputType("avg", this.outputType),
    }) as any;
  }

  min(): Expr<any, any> {
    return new FnExpr("min", [this], {
      decode: (v) => this.decode(v),
      outputType: minMaxOutputType(this.outputType),
    }) as any;
  }

  max(): Expr<any, any> {
    return new FnExpr("max", [this], {
      decode: (v) => this.decode(v),
      outputType: minMaxOutputType(this.outputType),
    }) as any;
  }

  arrayAgg(): Expr<any, any> {
    // Values are arrays while the argument encodes/decodes *elements*, i.e. a `.coalesce(["b:1"])`
    // fallback must encode each tagged id, not hand the whole array to the id column's encoder
    return new FnExpr("array_agg", [this], {
      decode: (v) => (Array.isArray(v) ? v.map((e) => this.decode(e)) : v),
      encode: (v) => (Array.isArray(v) ? v.map((e) => this.encode(e)) : v),
      outputType: arrayOutputType(this.outputType),
    }) as any;
  }

  stringAgg(delimiter: string): Expr<string | null, any> {
    return new FnExpr("string_agg", [this, new BindingExpr(delimiter)], {
      outputType:
        this.outputType?.domain === String ? { dbType: "text", domain: String, arrayElementSafe: true } : undefined,
    }) as any;
  }

  coalesce(fallback: unknown): Expr<any, never> {
    return new FnExpr("coalesce", [this, new BindingExpr(this.encode(fallback))], {
      decode: (v) => this.decode(v),
      outputType: this.outputType,
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
 * By default decoding is identity and encoding follows the first argument. Callers explicitly supply
 * a decoder and output type when needed (`max(a.id)` is still an id); numeric aggregates supply their
 * own decoder/encoder, since `count(a.id)` is a number, not an id. Unknown functions have no output type.
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
      outputType?: ExprOutputType;
    },
  ) {
    super();
  }

  get outputType(): ExprOutputType | undefined {
    return this.opts.outputType;
  }

  get sqlNullable(): boolean | undefined {
    switch (this.name) {
      case "count":
        return false;
      case "sum":
      case "avg":
      case "min":
      case "max":
      case "array_agg":
      case "string_agg":
        return true;
      case "coalesce":
        // Only the fallback is independent of an outer query's LEFT joins.
        return this.args[1]?.sqlNullable === false ? false : undefined;
      default:
        return undefined;
    }
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

  get sqlNullable(): boolean {
    return this.value === null || this.value === undefined;
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

  get sqlSource(): object {
    return this.handle;
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
 * For an Author table `a` assigned the SQL alias `a1`:
 *
 * ```ts
 * sql`${a.age} * 2`     // Expression: a1.age * 2
 * sql`${a.age.gte(18)}` // Condition: (a1.age >= ?), bindings [18]
 * sql`${"Alice"}`      // Value: ?, bindings ["Alice"]
 * ```
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

/**
 * Normalizes known PostgreSQL type synonyms without treating coercible types or user types as equal.
 * The output compatibility checks compare these names, so normalize only spellings of the same type.
 *
 * I.e. `integer` and `int` both mean `int4`; `integer[]` and `int4[]` also describe the same SQL type.
 * Keeping these spellings distinct would reject compatible outputs just because their serdes use
 * different names for the same representation.
 *
 * I.e. `int4` can be promoted to `int8`, but they are not synonyms: classic pg returns int4 as a number
 * and int8 as a string. Treating them as equal could admit a compound whose first operand's decoder
 * cannot handle the common SQL type. This function does not choose or apply a conversion.
 *
 * I.e. `citext` must stay distinct from `text`: they disagree on whether 'Alice' and 'alice' are equal,
 * which matters when a set operation compares rows. A user-defined `app.email` domain over text can
 * also impose constraints that text does not. Unknown names remain unchanged, including their schema
 * and quoting; neither coercibility nor a shared base type proves that their outputs are compatible.
 */
export function canonicalDbType(dbType: string): string {
  if (dbType.endsWith("[]")) return `${canonicalDbType(dbType.slice(0, -2))}[]`;
  switch (dbType) {
    case "smallint":
      return "int2";
    case "int":
    case "integer":
      return "int4";
    case "bigint":
      return "int8";
    case "decimal":
      return "numeric";
    case "real":
      return "float4";
    case "double precision":
      return "float8";
    case "boolean":
      return "bool";
    case "character varying":
      return "varchar";
    case "character":
      return "bpchar";
    case "timestamp without time zone":
      return "timestamp";
    case "timestamp with time zone":
      return "timestamptz";
    case "time without time zone":
      return "time";
    case "time with time zone":
      return "timetz";
    default:
      return dbType;
  }
}

const arrayDomains = new Map<unknown, Map<EntityMetadata | undefined, symbol>>();

// Both classic pg and lazy binary reads decode these physical arrays, not an unparsed array string.
const arrayElementDbTypes = new Set([
  "bool",
  "bytea",
  "int2",
  "int4",
  "int8",
  "float4",
  "float8",
  "numeric",
  "text",
  "varchar",
  "bpchar",
  "uuid",
  "json",
  "jsonb",
]);

/**
 * Describes elementwise conversion only for known physical array parsers and stable domain conversion.
 *
 * I.e. `a.id.arrayAgg()` wraps Author's tag and `idMeta` in its domain token, but has no scalar
 * `idMeta` of its own. Repeated expressions share the token; IDs of subtypes with a shared tag do not.
 * Native enum/citext, date/time, and nested SQL arrays remain unknown. Numeric elements can be numbers
 * in classic pg and strings in lazy binary reads, so a scalar string-only mapper is not sufficient.
 */
export function arrayOutputType(outputType: ExprOutputType | undefined): ExprOutputType | undefined {
  if (!outputType?.arrayElementSafe || !arrayElementDbTypes.has(outputType.dbType)) return undefined;
  let domains = arrayDomains.get(outputType.domain);
  if (!domains) arrayDomains.set(outputType.domain, (domains = new Map()));
  let domain = domains.get(outputType.idMeta);
  if (!domain) domains.set(outputType.idMeta, (domain = Symbol("joist.arrayOutput")));
  return { dbType: `${outputType.dbType}[]`, domain };
}

/**
 * Resolves the SQL result type of supported numeric aggregates; other overloads remain unknown.
 *
 * I.e. `a.age.sum()` has `dbType: "int8"` and Number conversion, while `a.age` has `dbType: "int4"`
 * and identity conversion. Their number domains agree, but SQL types reject a union in either order.
 */
function numericAggregateOutputType(
  name: "sum" | "avg",
  outputType: ExprOutputType | undefined,
): ExprOutputType | undefined {
  switch (outputType?.dbType) {
    case "int2":
    case "int4":
      return { dbType: name === "sum" ? "int8" : "numeric", domain: Number, arrayElementSafe: true };
    case "int8":
    case "numeric":
      return { dbType: "numeric", domain: Number, arrayElementSafe: true };
    case "float4":
      return { dbType: name === "sum" ? "float4" : "float8", domain: Number, arrayElementSafe: true };
    case "float8":
      return { dbType: "float8", domain: Number, arrayElementSafe: true };
    default:
      return undefined;
  }
}

/** Only known MIN/MAX overloads have predictable output types; varchar/name use the text overload. */
function minMaxOutputType(outputType: ExprOutputType | undefined): ExprOutputType | undefined {
  switch (outputType?.dbType) {
    case "varchar":
    case "name":
      return { ...outputType, dbType: "text" };
    case "int2":
    case "int4":
    case "int8":
    case "numeric":
    case "float4":
    case "float8":
    case "text":
    case "bpchar":
    case "date":
    case "time":
    case "timetz":
    case "timestamp":
    case "timestamptz":
    case "interval":
    case "money":
    case "inet":
      return outputType;
    default:
      return undefined;
  }
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
