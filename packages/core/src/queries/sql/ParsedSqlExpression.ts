import type { ColumnCondition, ExistsCondition, RawCondition } from "src/queries/parsedConditions.ts";
import { type ParsedReadQuery, queryRefs } from "src/queries/sql/ParsedQuery.ts";
import type { ParsedSource } from "src/queries/sql/query.ts";

/** Resolved SQL expressions, before rendering. Every variant has one unambiguous representation. */
export type ParsedSql =
  | ColumnSql // A column reference, i.e. `a.first_name`.
  | StarSql // All columns of a source, i.e. `a.*`.
  | JoinedSql // Syntax, values, and expressions, i.e. `LIMIT ` + { value: 10 }.
  | RawSql // Caller-supplied opaque SQL, i.e. sql`${a.age} * 2`.
  | QuerySql // A nested statement, i.e. the SELECT inside `EXISTS (SELECT ...)`.
  | ConditionSql; // A structured predicate tree, i.e. `a.age >= 18 AND a.deleted_at IS NULL`.

/** A column reference to a resolved source alias. */
export interface ColumnSql {
  kind: "column";
  alias: string;
  column: string;
}

/** All columns of a resolved source. */
export interface StarSql {
  kind: "star";
  alias: string;
}

/** A value already encoded for the database. */
export interface BoundValue {
  value: unknown;
}

export type SqlPart = string | BoundValue | ParsedSql;

/** SQL syntax interleaved with bound values and structured expressions. */
export interface JoinedSql {
  kind: "joined";
  parts: readonly SqlPart[];
}

/** Caller-supplied SQL syntax with resolved interpolations. */
export interface RawSql {
  kind: "raw";
  parts: readonly SqlPart[];
}

/** A child query. */
export interface QuerySql {
  kind: "query";
  query: ParsedReadQuery;
}

/** A structured predicate, including resolved expressions that may contain child queries. */
export interface ConditionSql {
  kind: "condition";
  condition: ParsedSqlFilter;
  topLevel: boolean;
}

/** A predicate expressed by a resolved SQL expression. */
export interface ExpressionCondition {
  kind: "expression";
  expression: ParsedSql;
}

export type ParsedSqlConditionLeaf = ColumnCondition | RawCondition | ExistsCondition | ExpressionCondition;

export type ParsedSqlCondition = ParsedSqlConditionLeaf | ParsedSqlFilter;

export interface ParsedSqlFilter {
  kind: "exp";
  op: "and" | "or";
  conditions: ParsedSqlCondition[];
}

/** Creates a column reference. */
export function columnSql(alias: string, column: string): ColumnSql {
  return { kind: "column", alias, column };
}

/** Joins SQL syntax and expressions without rendering their children. */
export function joinSql(parts: readonly SqlPart[], separator = ""): JoinedSql {
  return { kind: "joined", parts: parts.flatMap((part, index) => (index === 0 ? [part] : [separator, part])) };
}

/** Recursively finds aliases referenced in sql. */
export function sqlRefs(sql: ParsedSql): readonly string[] {
  switch (sql.kind) {
    case "column":
    case "star":
      return [sql.alias];
    case "query":
      return queryRefs(sql.query);
    case "joined":
    case "raw":
      return sql.parts.flatMap((part) => (typeof part !== "string" && "kind" in part ? sqlRefs(part) : []));
    case "condition":
      return conditionRefs(sql.condition);
    default:
      return assertNever(sql);
  }
}

/** Finds dependencies of a FROM or JOIN source. */
export function sourceRefs(source: ParsedSource): readonly string[] {
  switch (source.kind) {
    case "table":
      return [];
    case "cte":
      return [source.cte];
    case "query":
      return queryRefs(source.query);
    default:
      return assertNever(source);
  }
}

/** Visits an expression and its predicates; child queries are exposed as query nodes. */
export function visitSql(sql: ParsedSql, visitor: (node: ParsedSql | ParsedSqlCondition) => void): void {
  visitor(sql);
  if (sql.kind === "joined" || sql.kind === "raw") {
    for (const part of sql.parts) {
      if (typeof part !== "string" && "kind" in part) visitSql(part, visitor);
    }
  } else if (sql.kind === "condition") {
    visitCondition(sql.condition, visitor);
  }
}

/** Visits boolean groups and expression predicates. */
function visitCondition(condition: ParsedSqlCondition, visitor: (node: ParsedSql | ParsedSqlCondition) => void): void {
  visitor(condition);
  if (condition.kind === "exp") {
    for (const child of condition.conditions) visitCondition(child, visitor);
  } else if (condition.kind === "expression") {
    visitSql(condition.expression, visitor);
  }
}

/** Includes correlated references from expressions inside predicates. */
function conditionRefs(condition: ParsedSqlCondition): readonly string[] {
  switch (condition.kind) {
    case "exp":
      return condition.conditions.flatMap(conditionRefs);
    case "expression":
      return sqlRefs(condition.expression);
    case "column":
      return [condition.alias];
    case "raw":
      return condition.aliases;
    case "exists":
      return condition.outerAliases;
    default:
      return assertNever(condition);
  }
}

/** Keeps this expression-type module independent of EntityManager's runtime module graph. */
function assertNever(value: never): never {
  throw new Error(`Unexpected SQL node: ${String(value)}`);
}
