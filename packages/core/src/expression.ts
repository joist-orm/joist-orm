import { inspect } from "node:util";

import {
  BaseExpr,
  type Expr,
  type ExprBrand,
  type ExprContext,
  type ExprLike,
  type SqlFragment,
  exprBrand,
  joinFragments,
} from "./Expr.ts";
import type { CompatibleValue, MaybeNull, QueryCondition, QueryJoins } from "./query.ts";
import type { TypeInfo } from "./TypeInfo.ts";

/** One condition and the value to return when it is true. */
export interface CaseWhen {
  readonly when: QueryCondition | undefined;
  readonly then: unknown;
  readonly else?: never;
}

/** The fallback value, allowed only as the last entry in a CASE array. */
export interface CaseElse {
  readonly else: unknown;
  readonly when?: never;
  readonly then?: never;
}

// These expressions take operand arrays; CASE uses WHEN/THEN entries instead.
const exprNames = ["coalesce", "nullIf", "greatest", "least"] as const;
type ExprName = (typeof exprNames)[number];
type ExprArgsInput = { [K in ExprName]: { readonly [P in K]: readonly unknown[] } }[ExprName];
type ExprArgs<V> = Extract<V[keyof V & ExprName], readonly unknown[]>;

/** An expression object used in select or passed to expr, i.e. { coalesce: [a.last_name, a.first_name] }. */
export type ExprInput =
  | {
      [K in ExprName]: { readonly [P in K]: readonly unknown[] } & {
        readonly [P in Exclude<ExprName | "case" | "else", K>]?: never;
      };
    }[ExprName]
  | ({ readonly case: CaseWhen | readonly (CaseWhen | CaseElse)[] } & {
      readonly [K in ExprName | "else"]?: never;
    });

declare const inputBrand: unique symbol;

/** Retains the input object so query results can account for LEFT joins in each candidate separately. */
export type ExprFromInput<I> = Expr<InputResult<I, []>, ExpressionSources<I>> & {
  readonly [inputBrand]: I;
};

/**
 * Computes the TypeScript result type, including null from LEFT joins.
 * I.e. Book.title is string | null when Book is LEFT-joined; COALESCE(Book.title, "Unknown") is string.
 */
export type ExpressionValue<V, J extends QueryJoins> = unknown extends V
  ? V
  : V extends { readonly [inputBrand]: infer I }
    ? InputResult<I, J>
    : V extends { readonly [exprBrand]: ExprBrand<infer R, infer S> }
      ? MaybeNull<R, S, J>
      : V extends ExprArgsInput
        ? V extends { readonly nullIf: readonly unknown[] }
          ? ExpressionValue<ExprArgs<V>[0], J> | null
          : V extends { readonly coalesce: readonly unknown[] }
            ? CoalesceValue<ExprArgs<V>, J>
            :
                | Exclude<ExpressionValue<ExprArgs<V>[number], J>, null>
                | (null extends CoalesceValue<ExprArgs<V>, J> ? null : never)
        : V extends { readonly case: infer A }
          ?
              | ExpressionValue<CaseArmValue<A>, J>
              | (A extends readonly [...unknown[], { readonly else: unknown }] ? never : null)
          : WidenLiteral<V>;

/** Turns literal types such as "Alice" and 18 into string and number, including array elements. */
type WidenLiteral<V> = V extends string
  ? string
  : V extends number
    ? number
    : V extends boolean
      ? boolean
      : V extends bigint
        ? bigint
        : V extends readonly (infer E)[]
          ? WidenLiteral<E>[]
          : V;

/**
 * Uses existing expressions' result types for their literal fallbacks, just as their codecs do at runtime.
 * I.e. COALESCE(Book.id, "b:9") returns BookId rather than string. ExpressionValue supplies the nullability.
 */
type InputResult<I, J extends QueryJoins> = [Exclude<BranchResult<I>, null>] extends [never]
  ? ExpressionValue<I, J>
  : Exclude<BranchResult<I>, null> | (null extends ExpressionValue<I, J> ? null : never);

/** Collects the types supplied by columns and existing expressions, excluding plain literal fallbacks. */
type BranchResult<V> = unknown extends V
  ? never
  : V extends ExprLike<infer R>
    ? R
    : V extends ExprArgsInput
      ? BranchResult<V extends { readonly nullIf: readonly unknown[] } ? ExprArgs<V>[0] : ExprArgs<V>[number]>
      : V extends { readonly case: infer A }
        ? BranchResult<CaseArmValue<A>>
        : never;

/** A fixed non-null candidate guarantees a result; a possibly empty candidate array does not. */
type CoalesceValue<A extends readonly unknown[], J extends QueryJoins> = A extends readonly [infer H, ...infer T]
  ? Exclude<ExpressionValue<H, J>, null> | (null extends ExpressionValue<H, J> ? CoalesceValue<T, J> : never)
  : A extends readonly [...infer Before, infer Last]
    ?
        | Exclude<ExpressionValue<A[number], J>, null>
        | (null extends ExpressionValue<Last, J> ? (null extends CoalesceValue<Before, J> ? null : never) : never)
    : ExpressionValue<A[number], J> | null;

/** The values returned by CASE's THEN and ELSE entries. */
type CaseArmValue<A> = A extends readonly unknown[]
  ? CaseArmValue<A[number]>
  : A extends { readonly then: infer V }
    ? V
    : A extends { readonly else: infer V }
      ? V
      : never;

/** Conditions affect which value is chosen, but do not make that value nullable through a LEFT join. */
export type ExpressionSources<V> = unknown extends V
  ? string
  : V extends ExprLike<unknown>
    ? V[typeof exprBrand]["__source"]
    : V extends ExprArgsInput
      ? ExpressionSources<ExprArgs<V>[number]>
      : V extends { readonly case: infer A }
        ? ExpressionSources<CaseArmValue<A>>
        : never;

/**
 * Compares every operand with the others using the same type check as query set operations.
 * I.e. Author.age and 18 both yield number; Author.age and Author.first_name yield incompatible types.
 * SQL storage types and codecs are checked separately at runtime.
 */
type CompatibleValues<V, All = V> = false extends (
  V extends unknown
    ? All extends unknown
      ? CompatibleValue<ExpressionValue<V, []>, ExpressionValue<All, []>>
      : never
    : never
)
  ? "Expression values must have compatible types"
  : unknown;

/** Checks nested expression shapes and literal fallbacks in one pass; R is the type supplied by existing expressions. */
type CheckExpression<V, R> =
  V extends ExprLike<unknown>
    ? unknown
    : V extends ExprArgsInput
      ? V extends ExprInput
        ? {
            readonly [K in keyof V]: K extends ExprName
              ? V[K] extends readonly unknown[]
                ? CheckOperands<V[K], K, R>
                : never
              : never;
          }
        : never
      : V extends { readonly case: infer A }
        ? { readonly case: CheckCase<A, R> } & CompatibleValues<CaseArmValue<A>> & {
              readonly [K in Exclude<keyof V, "case">]: never;
            }
        : V extends undefined
          ? "Use null for a SQL NULL value"
          : [R] extends [never]
            ? unknown
            : V extends null
              ? unknown
              : V extends (R extends readonly unknown[] ? Readonly<R> : R)
                ? unknown
                : "Literal values must match the expression";

/** Checks fixed argument counts and then each operand; dynamic array lengths are checked at runtime. */
type CheckOperands<A extends readonly unknown[], Name extends ExprName, R> = (Name extends "nullIf"
  ? number extends A["length"]
    ? unknown
    : A extends readonly [unknown, unknown]
      ? unknown
      : "NULLIF needs exactly two values"
  : A extends readonly []
    ? `${Uppercase<Name>} needs at least one value`
    : unknown) & { readonly [K in keyof A]: CheckExpression<A[K], R> } & CompatibleValues<A[number]>;

/** A single CASE entry must be WHEN; an array can also have a final ELSE. */
type CheckCase<A, R> = A extends readonly []
  ? "CASE needs at least one arm"
  : A extends readonly unknown[]
    ? { readonly [K in keyof A]: CheckCaseEntry<A[K], R> } & CheckCaseOrder<A>
    : A extends CaseWhen
      ? CheckCaseEntry<A, R>
      : never;

/** Checks THEN/ELSE values and rejects extra keys on an entry. */
type CheckCaseEntry<A, R> = A extends CaseWhen
  ? { readonly [K in keyof A]: K extends "then" ? CheckExpression<A[K], R> : K extends "when" ? unknown : never }
  : A extends CaseElse
    ? { readonly [K in keyof A]: K extends "else" ? CheckExpression<A[K], R> : never }
    : never;

/** Fixed CASE arrays can be checked now; dynamic arrays get the same checks at runtime. */
type CheckCaseOrder<A extends readonly unknown[], HasWhen extends boolean = false> = A extends readonly [
  infer H,
  ...infer T,
]
  ? H extends { readonly else: unknown }
    ? HasWhen extends true
      ? T extends readonly []
        ? unknown
        : "CASE ELSE must be last"
      : "CASE needs a WHEN arm before ELSE"
    : CheckCaseOrder<T, true>
  : unknown;

/** Valid inputs need no extra constraint; this keeps spread arrays from losing their fixed final operand. */
export type CheckInput<I> = [I] extends [CheckExpression<I, Exclude<BranchResult<I>, null>>]
  ? unknown
  : CheckExpression<I, Exclude<BranchResult<I>, null>>;

/** Builds a reusable SQL value expression, binding literal values as parameters. */
export function expr<const I extends ExprInput>(input: I & CheckInput<NoInfer<I>>): ExprFromInput<I> {
  return buildExpr(input) as unknown as ExprFromInput<I>;
}

/** Parses explicit and inline inputs into a ParsedExpression, then wraps it in an Expr with a result codec. */
export function buildExpr(input: unknown): BaseExpr {
  if (!isObject(input) || (!("case" in input) && !exprNames.some((name) => name in input))) {
    throw new Error("expr expects an object with case, coalesce, nullIf, greatest, or least");
  }
  return new ObjectExpr(parseExpression(input));
}

/**
 * Recognizes an expression by its operand shape, not just its key.
 * I.e. { coalesce: [a.last_name, "Unknown"] } is scalar, but { coalesce: a.first_name } names a result column.
 */
export function isExprInput(value: unknown): value is ExprInput {
  if (!isObject(value) || value instanceof BaseExpr) return false;
  for (const name of exprNames) if (name in value && Array.isArray(value[name])) return true;
  if (!("case" in value)) return false;
  const arms = value.case;
  return (
    Array.isArray(arms) ||
    (isObject(arms) && !(arms instanceof BaseExpr) && ("when" in arms || "then" in arms || "else" in arms))
  );
}

/**
 * The internal form produced by parsing expression inputs, like ParsedFindQuery for em.find filters.
 * Existing Expr instances remain intact; literal operands and CASE results are parsed recursively.
 * CASE conditions retain their query input until SQL rendering supplies the alias context.
 */
type ParsedExpression =
  | BaseExpr
  | ParsedLiteralExpression
  | { kind: ExprName; operands: ParsedExpression[] }
  | ParsedCaseExpression;

/** A bound value whose encoder is selected from the surrounding expression. */
interface ParsedLiteralExpression {
  kind: "literal";
  value: unknown;
}

/** A CASE with a uniform WHEN list and a separate ELSE value, defaulting to SQL NULL. */
interface ParsedCaseExpression {
  kind: "case";
  arms: { when: QueryCondition | undefined; then: ParsedExpression }[];
  otherwise: ParsedExpression;
  hasElse: boolean;
}

/** The conversions shared by all result values, separate from their SQL rendering. */
type ResultCodec = Pick<BaseExpr, "outputType" | "encode" | "decode">;

/** Exposes a ParsedExpression through the Expr methods, SQL rendering, and shared result codec. */
class ObjectExpr extends BaseExpr {
  private readonly codec: ResultCodec;

  constructor(private readonly parsed: ParsedExpression) {
    super();
    this.codec = chooseExpressionCodec(parsed);
  }

  get outputType(): TypeInfo | undefined {
    return this.codec.outputType;
  }

  get sqlNullable(): boolean | undefined {
    return expressionNullable(this.parsed);
  }

  toSql(ctx: ExprContext): SqlFragment {
    return expressionToSql(this.parsed, ctx, this.codec);
  }

  decode(value: unknown): unknown {
    return value == null ? value : this.codec.decode(value);
  }

  encode(value: unknown): unknown {
    return value == null ? value : this.codec.encode(value);
  }
}

/** Gives literal-only expressions a SQL type so PostgreSQL does not return numbers as text. */
class LiteralCodec {
  constructor(readonly outputType: TypeInfo) {}

  encode(value: unknown): unknown {
    return value;
  }

  decode(value: unknown): unknown {
    return this.outputType.domain === BigInt ? BigInt(value as string) : value;
  }
}

/**
 * Parses expression inputs into a ParsedExpression, validating their shape and copying operand arrays.
 * Nested expressions stay together so their literals can use a column's codec from another branch.
 * I.e. COALESCE(Book.id, CASE ... THEN "b:9" END) must encode "b:9" as an integer.
 */
function parseExpression(input: unknown): ParsedExpression {
  if (input instanceof BaseExpr) return input;
  if (input === undefined) throw new Error("Use null for a SQL NULL value");
  const name = isObject(input) ? exprNames.find((name) => name in input) : undefined;
  if (name && isObject(input)) {
    checkKeys(input, [name]);
    const operands = input[name];
    if (!Array.isArray(operands) || (name === "nullIf" ? operands.length !== 2 : operands.length === 0)) {
      throw new Error(
        name === "nullIf" ? "NULLIF needs exactly two values" : `${name.toUpperCase()} needs at least one value`,
      );
    }
    return { kind: name, operands: operands.map((operand) => parseExpression(operand)) };
  }
  if (isObject(input) && "case" in input) {
    checkKeys(input, ["case"]);
    return parseCaseExpression(input.case);
  }
  return { kind: "literal", value: input };
}

/**
 * Parses WHEN entries and an optional final ELSE into a ParsedCaseExpression.
 * Requires at least one WHEN, even if its condition may later be pruned.
 */
function parseCaseExpression(input: unknown): ParsedCaseExpression {
  const entries = Array.isArray(input) ? input : [input];
  const parsed: ParsedCaseExpression = {
    kind: "case",
    arms: [],
    otherwise: parseExpression(null),
    hasElse: false,
  };
  for (const [i, entry] of entries.entries()) {
    if (isObject(entry) && "else" in entry) {
      checkKeys(entry, ["else"]);
      if (parsed.arms.length === 0) throw new Error("CASE needs a WHEN arm before ELSE");
      if (i !== entries.length - 1) throw new Error("CASE ELSE must be last");
      parsed.otherwise = parseExpression(entry.else);
      parsed.hasElse = true;
    } else {
      if (!isObject(entry) || !("when" in entry) || !("then" in entry))
        throw new Error("A CASE arm needs when and then");
      checkKeys(entry, ["when", "then"]);
      parsed.arms.push({ when: entry.when as QueryCondition | undefined, then: parseExpression(entry.then) });
    }
  }
  if (parsed.arms.length === 0) throw new Error("CASE needs at least one arm");
  return parsed;
}

/**
 * Chooses one decoder for all possible result values. Columns must agree on SQL type and domain;
 * literals use that column's encoder. This is conservative: PostgreSQL may accept other combinations,
 * but Joist cannot safely choose their decoder. I.e. Author.id and Book.id both store integers but use different tags.
 */
function chooseExpressionCodec(parsed: ParsedExpression): ResultCodec {
  const leaves = expressionLeaves(parsed);
  const expressions = leaves.filter((v): v is BaseExpr => v instanceof BaseExpr);
  const first = expressions[0];
  if (first) {
    for (const other of expressions.slice(1)) {
      if (other === first) continue;
      const a = first.outputType;
      const b = other.outputType;
      if (!a || !b || a.dbType !== b.dbType || a.domain !== b.domain || a.idMeta !== b.idMeta) {
        const mismatches =
          !a || !b
            ? ["unknown codec"]
            : [
                ...(a.dbType !== b.dbType ? ["SQL type"] : []),
                ...(a.domain !== b.domain ? ["domain"] : []),
                ...(a.idMeta !== b.idMeta ? ["ID target"] : []),
              ];
        throw new Error(
          `Expression operands need matching SQL types and codecs: ${describeType(a)} vs ${describeType(b)}; mismatched ${mismatches.join(", ")}`,
        );
      }
    }
    for (const leaf of leaves) {
      if (!(leaf instanceof BaseExpr)) checkLiteral(leaf.value, first.outputType);
    }
    return first;
  }
  const literals = leaves.filter((v): v is ParsedLiteralExpression => !(v instanceof BaseExpr));
  const types = literals.map((v) => literalType(v.value)).filter((v) => v !== undefined);
  for (const literal of literals) checkLiteral(literal.value, types[0]);
  return new LiteralCodec(types[0] ?? { dbType: "text", domain: String });
}

/** Finds parsed operands that share a codec, including NULLIF's comparison operand but not CASE conditions. */
function expressionLeaves(parsed: ParsedExpression): (BaseExpr | ParsedLiteralExpression)[] {
  if (parsed instanceof BaseExpr || parsed.kind === "literal") return [parsed];
  return parsed.kind !== "case"
    ? parsed.operands.flatMap((operand) => expressionLeaves(operand))
    : [...parsed.arms.flatMap((arm) => expressionLeaves(arm.then)), ...expressionLeaves(parsed.otherwise)];
}

/**
 * Renders a ParsedExpression in SQL binding order, resolving CASE conditions and collecting references for join pruning.
 * An omitted CASE condition removes its value as well. I.e. an unused Book.title branch must not keep the Book join.
 */
function expressionToSql(parsed: ParsedExpression, ctx: ExprContext, codec: ResultCodec): SqlFragment {
  if (parsed instanceof BaseExpr) return parsed.toSql(ctx);
  if (parsed.kind === "literal") {
    const dbType = codec.outputType?.dbType;
    return {
      sql: dbType ? `?::${dbType}` : "?",
      bindings: [parsed.value === null ? null : codec.encode(parsed.value)],
      refs: [],
    };
  }
  if (parsed.kind !== "case") {
    const parts = joinFragments(
      parsed.operands.map((operand) => expressionToSql(operand, ctx, codec)),
      ", ",
    );
    return { ...parts, sql: `${parsed.kind.toUpperCase()}(${parts.sql})` };
  }
  const parts: SqlFragment[] = [];
  for (const arm of parsed.arms) {
    const when = arm.when === undefined ? undefined : ctx.conditionToSql(arm.when);
    if (!when) continue;
    const branch = joinFragments([when, expressionToSql(arm.then, ctx, codec)], " THEN ");
    parts.push({ ...branch, sql: `WHEN ${branch.sql}` });
  }
  const otherwise = expressionToSql(parsed.otherwise, ctx, codec);
  if (parts.length === 0) return otherwise;
  if (parsed.hasElse) parts.push({ ...otherwise, sql: `ELSE ${otherwise.sql}` });
  const body = joinFragments(parts, " ");
  return { ...body, sql: `(CASE ${body.sql} END)` };
}

/** A direct column can become null through a LEFT join, so only independent values prove NOT NULL here. */
function expressionNullable(parsed: ParsedExpression): boolean | undefined {
  if (parsed instanceof BaseExpr) return parsed.sqlSource ? undefined : parsed.sqlNullable;
  if (parsed.kind === "literal") return parsed.value === null;
  if (parsed.kind === "nullIf") return true;
  if (parsed.kind !== "case")
    return parsed.operands.some((operand) => expressionNullable(operand) === false) ? false : undefined;
  return expressionNullable(parsed.otherwise) === false &&
    parsed.arms.every((arm) => expressionNullable(arm.then) === false)
    ? false
    : undefined;
}

/** Supplies predictable PostgreSQL types for standalone primitive literals. */
function literalType(value: unknown): TypeInfo | undefined {
  if (value === null) return undefined;
  if (typeof value === "string") return { dbType: "text", domain: String, arrayElementSafe: true };
  if (typeof value === "number") return { dbType: "float8", domain: Number, arrayElementSafe: true };
  if (typeof value === "boolean") return { dbType: "bool", domain: Boolean, arrayElementSafe: true };
  if (typeof value === "bigint") return { dbType: "int8", domain: BigInt };
  if (value instanceof Date) return { dbType: "timestamptz", domain: Date };
  throw new Error("Object and array literals need an expression with a matching codec");
}

/** Rejects primitive literals that disagree with the column; custom values are checked by their encoder. */
function checkLiteral(value: unknown, type: TypeInfo | undefined): void {
  if (value === null || !type) return;
  const domain = type.domain;
  if (
    (domain === String && typeof value !== "string") ||
    (domain === Number && typeof value !== "number") ||
    (domain === Boolean && typeof value !== "boolean") ||
    (domain === BigInt && typeof value !== "bigint") ||
    (domain === Date && !(value instanceof Date))
  ) {
    throw new Error(
      `Expression values must have compatible types: expected ${describeType(type)}, got ${inspect(value)} (${typeof value})`,
    );
  }
}

/** Names the storage type, conversion domain, and entity tag involved in a codec mismatch. */
function describeType(type: TypeInfo | undefined): string {
  if (!type) return "unknown codec";
  const domain = typeof type.domain === "function" ? type.domain.name : inspect(type.domain, { depth: 0 });
  return `${type.dbType} (domain ${domain}${type.idMeta ? `, ID target ${type.idMeta.type}` : ""})`;
}

/** Rejects misspelled or mixed expression keys rather than silently ignoring them. */
function checkKeys(value: object, allowed: string[]): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key)) throw new Error(`Unknown expression key '${String(key)}'`);
  }
}

/** Narrows expression input objects without treating null as an object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
