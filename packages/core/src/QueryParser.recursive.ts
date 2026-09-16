import { isAlias } from "./Aliases.ts";
import type { EntityMetadata, RecursiveRelationMetadata } from "./EntityMetadata.ts";
import { kqDot } from "./keywords.ts";
import {
  type ExistsCondition,
  type ParsedExpressionCondition,
  type ParsedFindQuery,
  type RawCondition,
  parseEntityFilter,
  parseFindQuery,
} from "./QueryParser.ts";
import { isScope } from "./scopes.ts";
import { fail } from "./utils.ts";

/** Finds a generated recursive collection, including one declared on a base type. */
export function findRecursiveRelation(meta: EntityMetadata, name: string): RecursiveRelationMetadata | undefined {
  if (meta.recursiveRelations?.[name]) return meta.recursiveRelations[name];
  for (const base of meta.baseTypes) {
    if (base.recursiveRelations?.[name]) return base.recursiveRelations[name];
  }
  return undefined;
}

/**
 * Adds an exact reachability CTE, seeded by entities matching the collection filter.
 *
 * Traversal runs backward from matching related entities to collection owners. I.e. for
 * `menteesRecursive: { firstName: "Alice" }`, `match_id` is Alice and `owner_id` starts
 * at her mentor, then moves to her grandmentor. Intermediate authors need not match.
 * UNION deduplicates (match_id, owner_id), so diamonds and cycles terminate; the
 * final EXISTS excludes self-reachability. Matching related entities must pass the
 * soft-delete filter, but the path to them can pass through soft-deleted entities.
 */
export function addRecursiveFilter(
  query: ParsedFindQuery,
  meta: EntityMetadata,
  ownerAlias: string,
  recursive: RecursiveRelationMetadata,
  filter: unknown,
  opts: Parameters<typeof parseFindQuery>[2],
  getAlias: (tableName: string) => string,
): ExistsCondition | undefined {
  validateRecursiveAliases(filter);
  const relation = meta.allFields[recursive.relationName];
  if (
    !relation ||
    !(relation.kind === "m2o" || relation.kind === "o2m" || relation.kind === "o2o" || relation.kind === "m2m")
  ) {
    fail(`Invalid backing relation for ${meta.type}.${recursive.fieldName}`);
  }
  const targetMeta = relation.otherMetadata();
  const parsed = parseEntityFilter(targetMeta, filter);
  if (!parsed) return undefined;
  const negate = parsed.kind === "is-null";
  const matches = parseFindQuery(targetMeta, negate ? true : filter, { softDeletes: opts?.softDeletes }, getAlias);
  // Empty objects and wholly undefined predicates prune like ordinary collection filters.
  if (!hasFilterCondition(matches.condition)) return undefined;
  const matchAlias = matches.tables.find((table) => table.join === "primary")!.alias;
  matches.selects = [`${kqDot(matchAlias, "id")} AS id`];
  matches.orderBys = [];

  // Resolve the physical FK table independently of the target subtype's matching query.
  let edgeTable: string;
  let fromColumn: string;
  let toColumn: string;
  if (relation.kind === "m2m") {
    edgeTable = relation.joinTableName;
    [toColumn, fromColumn] = relation.columnNames;
  } else {
    const fk = relation.kind === "m2o" ? relation : targetMeta.allFields[relation.otherFieldName];
    if (fk.kind !== "m2o") fail(`Invalid recursive FK for ${meta.type}.${recursive.fieldName}`);
    const fkMeta = relation.kind === "m2o" ? meta : targetMeta;
    const physicalMeta = [fkMeta, ...fkMeta.baseTypes].find((candidate) => fk.fieldName in candidate.fields)!;
    edgeTable = physicalMeta.tableName;
    const column = fk.serde.columns[0].columnName;
    [fromColumn, toColumn] = recursive.kind === "parents" ? [column, "id"] : ["id", column];
  }

  const matchesName = getAlias("recursive_matches");
  const reachName = getAlias("recursive_reach");
  const seed = traversalQuery(matchesName, "id", getAlias("recursive_seed"));
  const step = traversalQuery(reachName, "owner_id", getAlias("recursive_step"));
  (query.ctes ??= []).push(
    { alias: matchesName, query: { kind: "ast", query: matches } },
    {
      alias: reachName,
      columns: ["match_id", "owner_id"].map((columnName) => ({ columnName, dbType: targetMeta.idDbType })),
      recursive: true,
      recursiveFilter: { matchesAlias: matchesName },
      query: { kind: "recursive", seed, step },
    },
  );
  return {
    kind: "exists",
    negate,
    outerAliases: [ownerAlias],
    recursiveCte: reachName,
    subquery: {
      selects: ["1"],
      tables: [{ join: "primary", table: reachName, alias: reachName }],
      orderBys: [],
      condition: {
        kind: "exp",
        op: "and",
        conditions: [
          rawComparison(reachName, "owner_id", "=", ownerAlias, "id"),
          rawComparison(reachName, "match_id", "<>", ownerAlias, "id"),
        ],
      },
    },
  };

  /**
   * Moves one edge from matching related entities toward collection owners.
   * The seed reads matching entity IDs; the step preserves match_id while advancing owner_id.
   */
  function traversalQuery(source: string, sourceColumn: string, edgeAlias: string): ParsedFindQuery {
    return {
      selects: [kqDot(source, sourceColumn === "id" ? "id" : "match_id"), kqDot(edgeAlias, toColumn)],
      tables: [
        { join: "primary", table: source, alias: source },
        {
          join: "inner",
          table: edgeTable,
          alias: edgeAlias,
          col1: kqDot(source, sourceColumn),
          col2: kqDot(edgeAlias, fromColumn),
        },
      ],
      orderBys: [],
      condition: {
        kind: "exp",
        op: "and",
        conditions: [
          {
            kind: "column",
            alias: edgeAlias,
            column: toColumn,
            dbType: targetMeta.idDbType,
            cond: { kind: "not-null" },
          },
        ],
      },
    };
  }
}

/** Returns whether a matching query contains a user predicate rather than only visibility constraints. */
function hasFilterCondition(condition: ParsedExpressionCondition | undefined): boolean {
  if (!condition) return false;
  if (condition.kind === "exp") return condition.conditions.some((child) => hasFilterCondition(child));
  return condition.kind === "exists" || !condition.pruneable;
}

/** Builds a bound-free column comparison with explicit alias dependencies. */
function rawComparison(
  left: string,
  leftColumn: string,
  op: "=" | "<>",
  right: string,
  rightColumn: string,
): RawCondition {
  return {
    kind: "raw",
    aliases: [left, right],
    condition: `${kqDot(left, leftColumn)} ${op} ${kqDot(right, rightColumn)}`,
    bindings: [],
    pruneable: false,
  };
}

/** Rejects aliases exported from the related entity filter into the enclosing find query. */
function validateRecursiveAliases(filter: unknown): void {
  if (isScope(filter)) return;
  if (isAlias(filter) || (filter && typeof filter === "object" && "as" in filter && filter.as !== undefined)) {
    fail("Recursive collection filters do not support exporting aliases; use a scope for local alias predicates");
  }
  if (filter && typeof filter === "object") {
    for (const key of ["and", "or"] as const) {
      if (key in filter) {
        const value = (filter as Record<string, unknown>)[key];
        for (const child of Array.isArray(value) ? value : [value]) validateRecursiveAliases(child);
      }
    }
  }
}
