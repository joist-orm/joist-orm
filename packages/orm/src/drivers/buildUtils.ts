import { opToFn } from "../EntityGraphQLFilter";
import { isDefined } from "../EntityManager";
import { ColumnCondition, ParsedExpressionFilter, RawCondition } from "../QueryParser";
import { kqDot } from "../keywords";
import { assertNever } from "../utils";

/** Returns a tuple of `["cond AND (cond OR cond)", bindings]`. */
export function buildWhereClause(exp: ParsedExpressionFilter, topLevel = false): [string, any[]] | undefined {
  const tuples = exp.conditions
    .map((c) => {
      return c.kind === "exp"
        ? buildWhereClause(c)
        : c.kind === "column"
          ? buildCondition(c)
          : c.kind === "raw"
            ? buildRawCondition(c)
            : fail(`Invalid condition ${c}`);
    })
    .filter(isDefined);
  // If we don't have any conditions to combine, just return undefined;
  if (tuples.length === 0) return undefined;
  // Wrap/join the sql strings together first, and then flatten the bindings.
  let sql = tuples.map(([sql]) => sql).join(` ${exp.op.toUpperCase()} `);
  if (!topLevel) sql = `(${sql})`;
  return [sql, tuples.flatMap(([, bindings]) => bindings)];
}

function buildRawCondition(raw: RawCondition): [string, any[]] {
  if (raw.bindings.length > 0) {
    throw new Error("Not implemented");
  }
  return [raw.condition, []];
}

/** Returns a tuple of `["column op ?"`, bindings]`. */
export function buildCondition(cc: ColumnCondition): [string, any[]] {
  const { alias, column, cond } = cc;
  const columnName = kqDot(alias, column);
  switch (cond.kind) {
    case "eq":
    case "ne":
    case "gte":
    case "gt":
    case "lte":
    case "lt":
    case "like":
    case "nlike":
    case "ilike":
    case "nilike":
    case "regex":
    case "nregex":
    case "iregex":
    case "niregex":
    case "contains":
    case "containedBy":
    case "overlaps": {
      const fn = opToFn[cond.kind] ?? fail(`Invalid operator ${cond.kind}`);
      return [`${columnName} ${fn} ?`, [cond.value]];
    }
    case "noverlaps":
    case "ncontains": {
      const fn = (opToFn as any)[cond.kind.substring(1)] ?? fail(`Invalid operator ${cond.kind}`);
      return [`NOT (${columnName} ${fn} ?)`, [cond.value]];
    }
    case "is-null":
      return [`${columnName} IS NULL`, []];
    case "not-null":
      return [`${columnName} IS NOT NULL`, []];
    case "in":
      return [`${columnName} = ANY(?)`, [cond.value]];
    case "nin":
      return [`${columnName} != ALL(?)`, [cond.value]];
    case "between":
      return [`${columnName} BETWEEN ? AND ?`, cond.value];
    default:
      assertNever(cond);
  }
}
