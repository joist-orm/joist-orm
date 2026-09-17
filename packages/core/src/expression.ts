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
import type { MaybeNull, QueryCondition, QueryJoins } from "./query.ts";
import type { TypeInfo } from "./TypeInfo.ts";

/** One condition and the value to return when it is true. */
export interface CaseArm {
  readonly when: QueryCondition | undefined;
  readonly then: unknown;
}

const listNames = ["coalesce", "nullIf", "greatest", "least"] as const;
type ListName = (typeof listNames)[number];
type ListInput = { [K in ListName]: { readonly [P in K]: readonly unknown[] } }[ListName];
type ListValues<V> = Extract<V[keyof V & ListName], readonly unknown[]>;

/** SQL value expressions; operands can be expressions, literals, or nested descriptions. */
export type ExprDescription =
  | {
      [K in ListName]: { readonly [P in K]: readonly unknown[] } & {
        readonly [P in Exclude<ListName | "case" | "else", K>]?: never;
      };
    }[ListName]
  | ({ readonly case: CaseArm | readonly CaseArm[]; readonly else?: unknown } & {
      readonly [K in ListName]?: never;
    });

declare const descriptionBrand: unique symbol;

/** Retains the description so query results can account for LEFT joins in each candidate separately. */
export type DescribedExpr<D> = Expr<DescriptionResult<D, []>, ExpressionSources<D>> & {
  readonly [descriptionBrand]: D;
};

/** Resolves values with the selecting query's joins; an unknown input stays unknown instead of recursing into it. */
export type ExpressionValue<V, J extends QueryJoins> = unknown extends V
  ? V
  : V extends { readonly [descriptionBrand]: infer D }
    ? DescriptionResult<D, J>
    : V extends { readonly [exprBrand]: ExprBrand<infer R, infer S> }
      ? MaybeNull<R, S, J>
      : V extends ListInput
        ? V extends { readonly nullIf: readonly unknown[] }
          ? ExpressionValue<ListValues<V>[0], J> | null
          : V extends { readonly coalesce: readonly unknown[] }
            ? CoalesceValue<ListValues<V>, J>
            :
                | Exclude<ExpressionValue<ListValues<V>[number], J>, null>
                | (null extends CoalesceValue<ListValues<V>, J> ? null : never)
        : V extends { readonly case: infer A }
          ? ExpressionValue<ArmValue<A>, J> | (V extends { readonly else: infer E } ? ExpressionValue<E, J> : null)
          : V extends string
            ? string
            : V extends number
              ? number
              : V extends boolean
                ? boolean
                : V extends bigint
                  ? bigint
                  : V extends readonly (infer E)[]
                    ? ExpressionValue<E, J>[]
                    : V;

/** Literal fallbacks use the expression's domain, i.e. "b:9" stays a BookId when paired with Book.id. */
type DescriptionResult<D, J extends QueryJoins> = [Exclude<BranchResult<D>, null>] extends [never]
  ? ExpressionValue<D, J>
  : Exclude<BranchResult<D>, null> | (null extends ExpressionValue<D, J> ? null : never);
type BranchResult<V> = unknown extends V
  ? never
  : V extends ExprLike<infer R>
    ? R
    : V extends ListInput
      ? BranchResult<V extends { readonly nullIf: readonly unknown[] } ? ListValues<V>[0] : ListValues<V>[number]>
      : V extends { readonly case: infer A }
        ? BranchResult<ArmValue<A>> | (V extends { readonly else: infer E } ? BranchResult<E> : never)
        : never;

/** A fixed non-null candidate guarantees a result; a possibly empty candidate array does not. */
type CoalesceValue<A extends readonly unknown[], J extends QueryJoins> = A extends readonly [infer H, ...infer T]
  ? Exclude<ExpressionValue<H, J>, null> | (null extends ExpressionValue<H, J> ? CoalesceValue<T, J> : never)
  : A extends readonly [...infer Before, infer Last]
    ?
        | Exclude<ExpressionValue<A[number], J>, null>
        | (null extends ExpressionValue<Last, J> ? (null extends CoalesceValue<Before, J> ? null : never) : never)
    : ExpressionValue<A[number], J> | null;

type ArmValue<A> = A extends readonly unknown[]
  ? ArmValue<A[number]>
  : A extends { readonly then: infer V }
    ? V
    : never;

/** Conditions affect which value is chosen, but do not make that value nullable through a LEFT join. */
type ExpressionSources<V> = unknown extends V
  ? string
  : V extends ExprLike<unknown>
    ? V[typeof exprBrand]["__source"]
    : V extends ListInput
      ? ExpressionSources<ListValues<V>[number]>
      : V extends { readonly case: infer A }
        ? ExpressionSources<ArmValue<A>> | (V extends { readonly else: infer E } ? ExpressionSources<E> : never)
        : never;

/** Literal strings and numbers may differ in value while still sharing a SQL result type. */
type ValueFamily<V> = V extends string
  ? "string"
  : V extends number
    ? "number"
    : V extends boolean
      ? "boolean"
      : V extends bigint
        ? "bigint"
        : V extends readonly (infer E)[]
          ? readonly ValueFamily<Exclude<E, null>>[]
          : V;
type IsUnion<V, All = V> = V extends All ? ([All] extends [V] ? false : true) : never;
type CompatibleValues<V> =
  true extends IsUnion<ValueFamily<Exclude<ExpressionValue<V, []>, null>>>
    ? "Expression values must have compatible types"
    : unknown;

/** Checks nested descriptions without replacing the caller's inferred tuples or mapped arrays. */
type CheckExpression<V> =
  V extends ExprLike<unknown>
    ? unknown
    : V extends ListInput
      ? V extends ExprDescription
        ? {
            readonly [K in keyof V]: K extends ListName
              ? V[K] extends readonly unknown[]
                ? CheckValues<V[K], K>
                : never
              : never;
          }
        : never
      : V extends { readonly case: infer A }
        ? { readonly case: CheckArms<A> } & CompatibleValues<
            ArmValue<A> | (V extends { readonly else: infer E } ? E : null)
          > &
            (V extends { readonly else: infer E } ? { readonly else: CheckExpression<E> } : unknown) & {
              readonly [K in Exclude<keyof V, "case" | "else">]: never;
            }
        : V extends undefined
          ? "Use null for a SQL NULL value"
          : unknown;
type CheckValues<A extends readonly unknown[], Name extends ListName> = (Name extends "nullIf"
  ? number extends A["length"]
    ? unknown
    : A extends readonly [unknown, unknown]
      ? unknown
      : "NULLIF needs exactly two values"
  : A extends readonly []
    ? `${Uppercase<Name>} needs at least one value`
    : unknown) & { readonly [K in keyof A]: CheckExpression<A[K]> } & CompatibleValues<A[number]>;
type CheckArms<A> = A extends readonly []
  ? "CASE needs at least one arm"
  : A extends readonly unknown[]
    ? { readonly [K in keyof A]: CheckArms<A[K]> }
    : A extends CaseArm
      ? { readonly [K in keyof A]: K extends "then" ? CheckExpression<A[K]> : K extends "when" ? unknown : never }
      : never;

/** Literal branches must fit the column's value type, including enum values and array element nullability. */
type CheckLiterals<V, R> = [R] extends [never]
  ? unknown
  : V extends ExprLike<unknown>
    ? unknown
    : V extends ListInput
      ? { readonly [K in keyof V]: K extends ListName ? CheckListLiterals<V[K], R> : unknown }
      : V extends { readonly case: infer A }
        ? { readonly case: CheckArmLiterals<A, R> } & (V extends { readonly else: infer E }
            ? { readonly else: CheckLiterals<E, R> }
            : unknown)
        : V extends null
          ? unknown
          : V extends readonly (infer E)[]
            ? R extends readonly (infer T)[]
              ? [E] extends [T]
                ? unknown
                : "Array fallback elements must match the expression"
              : never
            : V extends R
              ? unknown
              : "Literal values must match the expression";
type CheckArmLiterals<A, R> = A extends readonly unknown[]
  ? { readonly [K in keyof A]: CheckArmLiterals<A[K], R> }
  : { readonly [K in keyof A]: K extends "then" ? CheckLiterals<A[K], R> : unknown };

type CheckListLiterals<A, R> = { readonly [K in keyof A]: CheckLiterals<A[K], R> };

/** Valid inputs need no extra constraint; this keeps spread arrays from losing their fixed final operand. */
type CheckDescription<D> = [D] extends [CheckExpression<D> & CheckLiterals<D, Exclude<BranchResult<D>, null>>]
  ? unknown
  : CheckExpression<D> & CheckLiterals<D, Exclude<BranchResult<D>, null>>;

/** Builds a reusable SQL value expression, binding literal values as parameters. */
export function expr<const D extends ExprDescription>(description: D & CheckDescription<NoInfer<D>>): DescribedExpr<D> {
  if (!isObject(description) || (!("case" in description) && !listNames.some((name) => name in description))) {
    throw new Error("expr expects a case, coalesce, nullIf, greatest, or least description");
  }
  return new ChoiceExpr(parseValue(description)) as unknown as DescribedExpr<D>;
}

type Value =
  | BaseExpr
  | { kind: "literal"; value: unknown }
  | { kind: ListName; values: Value[] }
  | { kind: "case"; arms: { when: QueryCondition | undefined; then: Value }[]; otherwise: Value; hasElse: boolean };

/** The conversions shared by all result values, separate from their SQL rendering. */
type ResultCodec = Pick<BaseExpr, "outputType" | "encode" | "decode">;

/** All operands share one result decoder, regardless of which value PostgreSQL chooses. */
class ChoiceExpr extends BaseExpr {
  private readonly codec: ResultCodec;

  constructor(private readonly value: Value) {
    super();
    this.codec = chooseCodec(value);
  }

  get outputType(): TypeInfo | undefined {
    return this.codec.outputType;
  }

  get sqlNullable(): boolean | undefined {
    return nullableValue(this.value);
  }

  toSql(ctx: ExprContext): SqlFragment {
    return renderValue(this.value, ctx, this.codec);
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
 * Validates descriptions and copies their value lists before rendering SQL.
 * Nested descriptions stay together so their literals can use a column's codec from another branch.
 * I.e. COALESCE(Book.id, CASE ... THEN "b:9" END) must encode "b:9" as an integer.
 */
function parseValue(value: unknown): Value {
  if (value instanceof BaseExpr) return value;
  if (value === undefined) throw new Error("Use null for a SQL NULL value");
  const name = isObject(value) ? listNames.find((name) => name in value) : undefined;
  if (name && isObject(value)) {
    checkKeys(value, [name]);
    const values = value[name];
    if (!Array.isArray(values) || (name === "nullIf" ? values.length !== 2 : values.length === 0)) {
      throw new Error(
        name === "nullIf" ? "NULLIF needs exactly two values" : `${name.toUpperCase()} needs at least one value`,
      );
    }
    return { kind: name, values: values.map((v) => parseValue(v)) };
  }
  if (isObject(value) && "case" in value) {
    checkKeys(value, ["case", "else"]);
    const arms = Array.isArray(value.case) ? value.case : [value.case];
    if (arms.length === 0) throw new Error("CASE needs at least one arm");
    return {
      kind: "case",
      arms: arms.map((arm) => {
        if (!isObject(arm) || !("when" in arm) || !("then" in arm)) throw new Error("A CASE arm needs when and then");
        checkKeys(arm, ["when", "then"]);
        return { when: arm.when as QueryCondition | undefined, then: parseValue(arm.then) };
      }),
      otherwise: parseValue("else" in value ? value.else : null),
      hasElse: "else" in value,
    };
  }
  return { kind: "literal", value };
}

/**
 * Chooses one decoder for all possible result values. Columns must agree on SQL type and domain;
 * literals use that column's encoder. This is conservative: PostgreSQL may accept other combinations,
 * but Joist cannot safely choose their decoder. I.e. Author.id and Book.id both store integers but use different tags.
 */
function chooseCodec(value: Value): ResultCodec {
  const leaves = valueLeaves(value);
  const expressions = leaves.filter((v): v is BaseExpr => v instanceof BaseExpr);
  const first = expressions[0];
  if (first) {
    for (const other of expressions.slice(1)) {
      if (other === first) continue;
      const a = first.outputType;
      const b = other.outputType;
      if (!a || !b || a.dbType !== b.dbType || a.domain !== b.domain || a.idMeta !== b.idMeta) {
        throw new Error("Expression operands need matching SQL types and codecs");
      }
    }
    for (const leaf of leaves) {
      if (!(leaf instanceof BaseExpr)) checkLiteral(leaf.value, first.outputType);
    }
    return first;
  }
  const types = leaves.map((v) => literalType((v as { value: unknown }).value)).filter((v) => v !== undefined);
  if (types.some((t) => t.domain !== types[0].domain)) throw new Error("Expression values must have compatible types");
  return new LiteralCodec(types[0] ?? { dbType: "text", domain: String });
}

/** Finds values that must share a codec, including NULLIF's comparison operand but not CASE conditions. */
function valueLeaves(value: Value): (BaseExpr | { kind: "literal"; value: unknown })[] {
  if (value instanceof BaseExpr || value.kind === "literal") return [value];
  return value.kind !== "case"
    ? value.values.flatMap((v) => valueLeaves(v))
    : [...value.arms.flatMap((arm) => valueLeaves(arm.then)), ...valueLeaves(value.otherwise)];
}

/**
 * Renders conditions and values in SQL binding order, with references for join pruning.
 * An omitted CASE condition removes its value as well. I.e. an unused Book.title branch must not keep the Book join.
 */
function renderValue(value: Value, ctx: ExprContext, codec: ResultCodec): SqlFragment {
  if (value instanceof BaseExpr) return value.toSql(ctx);
  if (value.kind === "literal") {
    const dbType = codec.outputType?.dbType;
    return {
      sql: dbType ? `?::${dbType}` : "?",
      bindings: [value.value === null ? null : codec.encode(value.value)],
      refs: [],
    };
  }
  if (value.kind !== "case") {
    const parts = joinFragments(
      value.values.map((v) => renderValue(v, ctx, codec)),
      ", ",
    );
    return { ...parts, sql: `${value.kind.toUpperCase()}(${parts.sql})` };
  }
  const parts: SqlFragment[] = [];
  for (const arm of value.arms) {
    const when = arm.when === undefined ? undefined : ctx.conditionToSql(arm.when);
    if (!when) continue;
    const branch = joinFragments([when, renderValue(arm.then, ctx, codec)], " THEN ");
    parts.push({ ...branch, sql: `WHEN ${branch.sql}` });
  }
  const otherwise = renderValue(value.otherwise, ctx, codec);
  if (parts.length === 0) return otherwise;
  if (value.hasElse) parts.push({ ...otherwise, sql: `ELSE ${otherwise.sql}` });
  const body = joinFragments(parts, " ");
  return { ...body, sql: `(CASE ${body.sql} END)` };
}

/** A direct column can become null through a LEFT join, so only independent values prove NOT NULL here. */
function nullableValue(value: Value): boolean | undefined {
  if (value instanceof BaseExpr) return value.sqlSource ? undefined : value.sqlNullable;
  if (value.kind === "literal") return value.value === null;
  if (value.kind === "nullIf") return true;
  if (value.kind !== "case") return value.values.some((v) => nullableValue(v) === false) ? false : undefined;
  return nullableValue(value.otherwise) === false && value.arms.every((arm) => nullableValue(arm.then) === false)
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
    throw new Error("Expression values must have compatible types");
  }
}

/** Rejects misspelled or mixed expression keys rather than silently ignoring them. */
function checkKeys(value: object, allowed: string[]): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.includes(key)) throw new Error(`Unknown expression key '${String(key)}'`);
  }
}

/** Narrows description objects without treating null as an object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
