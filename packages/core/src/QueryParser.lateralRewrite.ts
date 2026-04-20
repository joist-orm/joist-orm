import {
  BoolOrSelect,
  JoinTable,
  LateralJoinTable,
  parseAlias,
  ParsedExpressionCondition,
  ParsedExpressionFilter,
  ParsedFindQuery,
  ParsedSelect,
  RawCondition,
} from "./QueryParser";
import { kq, kqDot } from "./keywords";
import { assertNever } from "./utils";

/**
 * Rewrites collection find queries from LEFT OUTER JOINs + DISTINCT ON to
 * CROSS JOIN LATERAL + BOOL_OR. Activates in two modes:
 *
 * 1. Auto-detect (lateralJoins=false): rewrites when any join node in the tree
 *    has 2+ sibling collection children, at any depth. E.g. both
 *    `Author → Books + Comments` (siblings off primary) and
 *    `Author → Books → Reviews + Advances` (siblings off intermediate) are detected.
 *
 * 2. Force (lateralJoins=true): rewrites ALL collection joins, even a single
 *    collection with no siblings.
 *
 * Each rewritten collection becomes a LATERAL subquery that aggregates child rows
 * via BOOL_OR, producing exactly one row per parent. The main WHERE then references
 * the lateral's boolean columns instead of the original child-table conditions.
 *
 * @param collectionJoins Array of collection join entries recorded by QueryParser
 *   as it builds o2m/m2m joins. Each entry has the parent alias and the JoinTable
 *   reference. Avoids re-deriving collection structure from the query's join tables.
 */
export function rewriteCollectionJoinsToLateral(
  query: ParsedFindQuery,
  lateralJoins: boolean = false,
  collectionJoins: { parentAlias: string; join: JoinTable }[] = [],
): void {
  if (collectionJoins.length === 0) return;

  // Group by parent alias
  const childrenByParent = new Map<string, JoinTable[]>();
  for (const { parentAlias, join } of collectionJoins) {
    let children = childrenByParent.get(parentAlias);
    if (!children) {
      children = [];
      childrenByParent.set(parentAlias, children);
    }
    children.push(join);
  }

  // Determine which collection joins to rewrite
  const rewriteRoots: JoinTable[] = [];
  if (lateralJoins) {
    for (const { join } of collectionJoins) rewriteRoots.push(join);
  } else {
    for (const [, children] of childrenByParent) {
      if (children.length >= 2) {
        rewriteRoots.push(...children);
      }
    }
  }
  if (rewriteRoots.length === 0) return;

  // 5. Build subtrees: for each rewrite root, collect all descendant join aliases.
  // Descendants include m2m target joins and other inner/outer joins within the collection tree.
  const allJoins = query.tables.filter((t): t is JoinTable => t.join === "inner" || t.join === "outer");
  const rootForAlias = new Map<string, string>(); // alias → rewrite root alias
  for (const root of rewriteRoots) {
    rootForAlias.set(root.alias, root.alias);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const j of allJoins) {
      if (!rootForAlias.has(j.alias)) {
        const parentRoot = rootForAlias.get(parseAlias(j.col1));
        if (parentRoot) {
          rootForAlias.set(j.alias, parentRoot);
          changed = true;
        }
      }
    }
  }

  // Build the set of all aliases belonging to each rewrite root
  const rootSubtreeAliases = new Map<string, Set<string>>();
  for (const root of rewriteRoots) {
    rootSubtreeAliases.set(root.alias, new Set());
  }
  for (const [alias, rootAlias] of rootForAlias) {
    rootSubtreeAliases.get(rootAlias)!.add(alias);
  }

  // 6. Decompose the condition tree: figure out which conditions belong to which rewrite root
  let condCounter = 0;
  const boolOrSelectsPerRoot = new Map<string, ParsedSelect[]>();
  for (const root of rewriteRoots) {
    boolOrSelectsPerRoot.set(root.alias, []);
  }
  const antiJoinRoots = new Set<string>();

  const pruneablePerRoot = new Map<string, ParsedExpressionCondition[]>();
  for (const root of rewriteRoots) {
    pruneablePerRoot.set(root.alias, []);
  }

  function decomposeExpression(exp: ParsedExpressionFilter): ParsedExpressionFilter | undefined {
    const remaining: ParsedExpressionCondition[] = [];
    const perRoot = new Map<string, ParsedExpressionCondition[]>();

    for (const c of exp.conditions) {
      if ((c.kind === "column" || c.kind === "raw") && c.pruneable) {
        const root = getConditionRoot(rootForAlias, c);
        if (root) {
          pruneablePerRoot.get(root)!.push(c);
          continue;
        }
      }

      const root = getConditionRoot(rootForAlias, c);
      if (root === undefined) {
        if (c.kind === "exp") {
          const rewritten = decomposeExpression(c);
          if (rewritten) remaining.push(rewritten);
        } else {
          remaining.push(c);
        }
      } else {
        if (!perRoot.has(root)) perRoot.set(root, []);
        perRoot.get(root)!.push(c);
      }
    }

    for (const [rootAlias, conditions] of perRoot) {
      const condAlias = `_cond${condCounter++}`;
      const lateralAlias = `_lat_${rootAlias}`;

      const isAntiJoin = conditions.every(
        (c) => c.kind === "column" && c.column === "id" && c.cond.kind === "is-null" && c.alias === rootAlias,
      );

      if (isAntiJoin) {
        antiJoinRoots.add(rootAlias);
        const countSelect: ParsedSelect = {
          sql: `count(*) = 0 AS ${kq(condAlias)}`,
          bindings: [],
          aliases: [rootAlias],
        };
        boolOrSelectsPerRoot.get(rootAlias)!.push(countSelect);
      } else {
        const boolOrCondition: ParsedExpressionFilter = {
          kind: "exp",
          op: exp.op,
          conditions,
        };
        const boolOr: BoolOrSelect = {
          kind: "bool_or",
          as: condAlias,
          condition: boolOrCondition,
        };
        boolOrSelectsPerRoot.get(rootAlias)!.push(boolOr);
      }

      const ref: RawCondition = {
        kind: "raw",
        aliases: [lateralAlias],
        condition: kqDot(lateralAlias, condAlias),
        bindings: [],
        pruneable: false,
      };
      remaining.push(ref);
    }

    if (remaining.length === 0) return undefined;
    if (remaining.length === 1 && remaining[0].kind === "exp") return remaining[0];
    return { kind: "exp", op: exp.op, conditions: remaining };
  }

  // 7. Decompose the top-level condition tree
  if (query.condition) {
    query.condition = decomposeExpression(query.condition);
  }

  // 8. Build LateralJoinTable per rewrite root
  const allRewrittenAliases = new Set(rootForAlias.keys());
  const newTables = query.tables.filter((t) => {
    if (t.join === "primary") return true;
    if (t.join === "lateral" || t.join === "cross") return true;
    if (t.join === "outer" && t.distinct === false) return true;
    if (t.join === "inner" && !allRewrittenAliases.has(t.alias)) return true;
    return !allRewrittenAliases.has(t.alias);
  });

  for (const root of rewriteRoots) {
    const subtreeAliases = rootSubtreeAliases.get(root.alias)!;
    const boolOrSelects = boolOrSelectsPerRoot.get(root.alias)!;
    const pruneableConditions = pruneablePerRoot.get(root.alias)!;

    if (boolOrSelects.length === 0) continue;

    // The parent alias for correlation — this is the alias the root joins FROM,
    // which may be the primary table or an intermediate (e.g., project_stages)
    const parentAlias = parseAlias(root.col1);
    const lateralAlias = `_lat_${root.alias}`;

    const innerPrimary = {
      join: "primary" as const,
      alias: root.alias,
      table: root.table,
    };

    const innerJoins = [...subtreeAliases]
      .filter((a) => a !== root.alias)
      .map((a) => {
        const originalJoin = query.tables.find((t) => t.alias === a) as JoinTable;
        return {
          ...originalJoin,
          join: "inner" as const,
        };
      });

    // Correlation predicate: e.g., parentAlias.id = root.author_id
    const correlationCondition: RawCondition = {
      kind: "raw",
      aliases: [root.alias, parentAlias],
      condition: `${root.col1} = ${root.col2}`,
      bindings: [],
      pruneable: false,
    };

    const lateralWhere: ParsedExpressionFilter = {
      kind: "exp",
      op: "and",
      conditions: [correlationCondition, ...pruneableConditions],
    };

    const lateralQuery: ParsedFindQuery = {
      selects: boolOrSelects,
      tables: [innerPrimary, ...innerJoins],
      condition: lateralWhere,
      orderBys: [],
    };

    const lateral: LateralJoinTable = {
      join: "lateral",
      alias: lateralAlias,
      fromAlias: parentAlias,
      table: root.table,
      query: lateralQuery,
    };

    newTables.push(lateral);
  }

  query.tables = newTables;
}

function getConditionRoot(rootForAlias: Map<string, string>, c: ParsedExpressionCondition): string | undefined {
  if (c.kind === "column") {
    return rootForAlias.get(c.alias);
  } else if (c.kind === "raw") {
    const roots = new Set<string>();
    for (const alias of c.aliases) {
      const r = rootForAlias.get(alias);
      if (r) roots.add(r);
    }
    if (roots.size > 1) {
      throw new Error("RawCondition spanning multiple collection paths is not supported with lateral rewrite");
    }
    return roots.size === 1 ? [...roots][0] : undefined;
  } else if (c.kind === "exp") {
    return getExpressionRoot(rootForAlias, c);
  } else {
    assertNever(c);
  }
}

function getExpressionRoot(rootForAlias: Map<string, string>, exp: ParsedExpressionFilter): string | undefined {
  const roots = new Set<string | undefined>();
  for (const c of exp.conditions) {
    roots.add(getConditionRoot(rootForAlias, c));
  }
  if (roots.size === 1) return [...roots][0];
  return undefined;
}
