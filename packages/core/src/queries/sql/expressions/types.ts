import type { BaseExpr, Expr, ExprBrand, ExprLike, exprBrand } from "src/queries/sql/Expr.ts";
import type {
  ArrayAggExpressionOptions,
  ArrayAggInput,
  ParsedArrayAggExpression,
} from "src/queries/sql/expressions/arrayAgg.ts";
import type { CaseArmValue, CaseInput, CheckCase, ParsedCaseExpression } from "src/queries/sql/expressions/case.ts";
import type { CoalesceInput, ParsedCoalesceExpression } from "src/queries/sql/expressions/coalesce.ts";
import type { GreatestInput, ParsedGreatestExpression } from "src/queries/sql/expressions/greatest.ts";
import type { LeastInput, ParsedLeastExpression } from "src/queries/sql/expressions/least.ts";
import type { NullIfInput, ParsedNullIfExpression } from "src/queries/sql/expressions/nullIf.ts";
import type { CompatibleValue, MaybeNull, QueryJoinList } from "src/queries/sql/query.ts";

/** Each operation owns its input fields; the combined input permits exactly one operation. */
interface ExprInputs {
  case: CaseInput;
  arrayAgg: ArrayAggInput;
  coalesce: CoalesceInput;
  nullIf: NullIfInput;
  greatest: GreatestInput;
  least: LeastInput;
}

// These expressions take operand arrays; CASE uses WHEN/THEN entries instead.
export type ExprName = Exclude<keyof ExprInputs, "case" | "arrayAgg">;
type ExprArgsInput = { [K in ExprName]: { readonly [P in K]: readonly unknown[] } }[ExprName];
type ExprArgs<V> = Extract<V[keyof V & ExprName], readonly unknown[]>;

/** An expression object used in select or passed to expr, i.e. { coalesce: [a.last_name, a.first_name] }. */
export type ExprInput = {
  [K in keyof ExprInputs]: ExprInputs[K] & { readonly [P in Exclude<keyof ExprInputs | "else", K>]?: never };
}[keyof ExprInputs];

declare const inputBrand: unique symbol;

/** Retains the input object so query results can account for LEFT joins in each candidate separately. */
export type ExprFromInput<I> = Expr<InputResult<I, []>, ExpressionSources<I>> & {
  readonly [inputBrand]: I;
};

/**
 * Computes the SQL expression type, including null from LEFT joins.
 * I.e. Book.title is string | null when Book is LEFT-joined; COALESCE(Book.title, "Unknown") is string.
 */
export type ExpressionValue<V, J extends QueryJoinList> = unknown extends V
  ? // Keep unknown and any broad instead of interpreting a widened public input as a structural expression shape.
    V
  : V extends { readonly [inputBrand]: infer I }
    ? InputResult<I, J>
    : V extends { readonly [exprBrand]: ExprBrand<infer R, infer S> }
      ? MaybeNull<R, S, J>
      : V extends { readonly arrayAgg: infer A }
        ? ExpressionValue<ArrayAggValue<A>, J>[] | null
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
type InputResult<I, J extends QueryJoinList> = [Exclude<BranchResult<I>, null>] extends [never]
  ? ExpressionValue<I, J>
  : Exclude<BranchResult<I>, null> | (null extends ExpressionValue<I, J> ? null : never);

/** Collects the types supplied by columns and existing expressions, excluding plain literal fallbacks. */
type BranchResult<V> = unknown extends V
  ? never
  : V extends ExprLike<infer R>
    ? R
    : V extends { readonly arrayAgg: infer A }
      ? BranchResult<ArrayAggValue<A>>[]
      : V extends ExprArgsInput
        ? BranchResult<V extends { readonly nullIf: readonly unknown[] } ? ExprArgs<V>[0] : ExprArgs<V>[number]>
        : V extends { readonly case: infer A }
          ? BranchResult<CaseArmValue<A>>
          : never;

/** A fixed non-null candidate guarantees a result; a possibly empty candidate array does not. */
type CoalesceValue<A extends readonly unknown[], J extends QueryJoinList> = A extends readonly [infer H, ...infer T]
  ? Exclude<ExpressionValue<H, J>, null> | (null extends ExpressionValue<H, J> ? CoalesceValue<T, J> : never)
  : A extends readonly [...infer Before, infer Last]
    ?
        | Exclude<ExpressionValue<A[number], J>, null>
        | (null extends ExpressionValue<Last, J> ? (null extends CoalesceValue<Before, J> ? null : never) : never)
    : ExpressionValue<A[number], J> | null;

/** Conditions affect which value is chosen, but do not make that value nullable through a LEFT join. */
export type ExpressionSources<V> = unknown extends V
  ? string
  : V extends ExprLike<unknown>
    ? V[typeof exprBrand]["__source"]
    : V extends { readonly arrayAgg: infer A }
      ? ExpressionSources<ArrayAggValue<A>>
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
export type CheckExpression<V, R> =
  V extends ExprLike<unknown>
    ? unknown
    : V extends { readonly arrayAgg: infer A }
      ? { readonly arrayAgg: CheckArrayAgg<A, R extends readonly (infer E)[] ? E : never> } & {
          readonly [K in Exclude<keyof V, "arrayAgg">]: never;
        }
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

/** Valid inputs need no extra constraint; this keeps spread arrays from losing their fixed final operand. */
export type CheckInput<I> = [I] extends [CheckExpression<I, Exclude<BranchResult<I>, null>>]
  ? unknown
  : CheckExpression<I, Exclude<BranchResult<I>, null>>;

/**
 * The internal form produced by parsing expression inputs, like ParsedFindQuery for em.find filters.
 * Existing Expr instances remain intact; literal operands and CASE results are parsed recursively.
 * CASE conditions retain their query input until SQL rendering supplies the alias context.
 */
export type ParsedExpression =
  | BaseExpr
  | ParsedLiteralExpression
  | ParsedArrayAggExpression
  | ParsedCoalesceExpression
  | ParsedNullIfExpression
  | ParsedGreatestExpression
  | ParsedLeastExpression
  | ParsedCaseExpression;

/** A bound value whose encoder is selected from the surrounding expression. */
export interface ParsedLiteralExpression {
  kind: "literal";
  value: unknown;
}

/** The conversions shared by all result values, separate from their SQL rendering. */
export type ResultCodec = Pick<BaseExpr, "outputType" | "encode" | "decode">;

/** Extracts the aggregate value from compact or expanded ARRAY_AGG input. */
type ArrayAggValue<A> = A extends { readonly value: infer V } ? V : A;

/** Checks the aggregate value and rejects unknown expanded option keys. */
type CheckArrayAgg<A, R> = A extends { readonly value: unknown }
  ? A extends ArrayAggExpressionOptions
    ? {
        readonly [K in keyof A]: K extends "value"
          ? CheckExpression<A[K], R>
          : K extends keyof ArrayAggExpressionOptions
            ? A[K]
            : never;
      }
    : never
  : CheckExpression<A, R>;
