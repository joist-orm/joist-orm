import { inspect } from "node:util";

import { type TypeInfo, arrayOutputType } from "../../../serde/TypeInfo.ts";
import { assertNever } from "../../../utils.ts";
import { BaseExpr } from "../Expr.ts";
import type { ParsedExpression, ParsedLiteralExpression, ResultCodec } from "./types.ts";

/**
 * Chooses one decoder for all possible result values. Columns must agree on a compatible SQL type and domain;
 * literals use that column's encoder. This is conservative: PostgreSQL may accept other combinations,
 * but Joist cannot safely choose their decoder. I.e. Author.id and Book.id both store integers but use different tags.
 */
export function chooseExpressionCodec(parsed: ParsedExpression): ResultCodec {
  const leaves = expressionLeaves(parsed);
  const expressions = leaves.flatMap((leaf) => ("codec" in leaf ? [leaf.codec] : []));
  const first = expressions[0];
  if (first) {
    for (const other of expressions.slice(1)) {
      if (other === first) continue;
      const a = first.outputType;
      const b = other.outputType;
      if (!a || !b || !compatibleDbTypes(a.dbType, b.dbType) || a.domain !== b.domain || a.idMeta !== b.idMeta) {
        const mismatches =
          !a || !b
            ? ["unknown codec"]
            : [
                ...(!compatibleDbTypes(a.dbType, b.dbType) ? ["SQL type"] : []),
                ...(a.domain !== b.domain ? ["domain"] : []),
                ...(a.idMeta !== b.idMeta ? ["ID target"] : []),
              ];
        throw new Error(
          `Expression operands need matching SQL types and codecs: ${describeType(a)} vs ${describeType(b)}; mismatched ${mismatches.join(", ")}`,
        );
      }
    }
    for (const leaf of leaves) if ("literal" in leaf) checkLiteral(leaf.literal.value, first.outputType);
    return first;
  }
  const literals = leaves.flatMap((leaf) => ("literal" in leaf ? [leaf.literal] : []));
  const types = literals.map((v) => literalType(v.value)).filter((v) => v !== undefined);
  for (const literal of literals) checkLiteral(literal.value, types[0]);
  return new LiteralCodec(types[0] ?? { dbType: "text", domain: String });
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
 * Finds parsed operands that share a codec, including NULLIF's comparison operand but not CASE conditions.
 * Each kind selects its own value fields; only CASE's THEN and ELSE expressions contribute a result codec.
 */
function expressionLeaves(parsed: ParsedExpression): CodecLeaf[] {
  if (parsed instanceof BaseExpr) return [{ codec: parsed }];
  switch (parsed.kind) {
    case "literal":
      return [{ literal: parsed }];
    case "arrayAgg": {
      const valueCodec = chooseExpressionCodec(parsed.value);
      return [
        {
          codec: {
            outputType: arrayOutputType(valueCodec.outputType),
            encode: (value) => (Array.isArray(value) ? value.map((element) => valueCodec.encode(element)) : value),
            decode: (value) => (Array.isArray(value) ? value.map((element) => valueCodec.decode(element)) : value),
          },
        },
      ];
    }
    case "coalesce":
      return parsed.candidates.flatMap((candidate) => expressionLeaves(candidate));
    case "nullIf":
      return [...expressionLeaves(parsed.value), ...expressionLeaves(parsed.equals)];
    case "greatest":
    case "least":
      return parsed.values.flatMap((value) => expressionLeaves(value));
    case "case":
      return [
        ...parsed.whens.flatMap((entry) => expressionLeaves(entry.then)),
        ...(parsed.else ? expressionLeaves(parsed.else) : []),
      ];
    default:
      return assertNever(parsed);
  }
}

/** One result codec or one literal that will adopt a sibling codec. */
type CodecLeaf = { codec: ResultCodec } | { literal: ParsedLiteralExpression };

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

const compatibleStringDbTypes = new Set(["text", "varchar"]);

/** Allows PostgreSQL scalar string types that resolve to a common string result. */
function compatibleDbTypes(a: string, b: string): boolean {
  return a === b || (compatibleStringDbTypes.has(a) && compatibleStringDbTypes.has(b));
}
