import {
  ExistsCondition,
  JoinTable,
  ParsedExpressionCondition,
  ParsedExpressionFilter,
  ParsedFindQuery,
  RawCondition,
  parseAlias,
} from "./QueryParser";
import { assertNever } from "./utils";

/**
 * Rewrites collection find queries from LEFT OUTER JOINs + DISTINCT ON to
 * EXISTS / NOT EXISTS subqueries.
 *
 * Every collection join (o2m/m2m) becomes an EXISTS subquery in the WHERE clause.
 * This avoids cross-product row explosion entirely and never needs DISTINCT ON.
 *
 * For nested collection paths (e.g., Author → Books → Reviews + Advances), the
 * rewrite produces nested EXISTS:
 *
 * ```sql
 * WHERE EXISTS (
 *   SELECT 1 FROM books b WHERE b.author_id = a.id
 *     AND EXISTS (SELECT 1 FROM book_reviews br WHERE br.book_id = b.id AND ...)
 *     AND EXISTS (SELECT 1 FROM book_advances ba WHERE ba.book_id = b.id AND ...)
 * )
 * ```
 *
 * @param collectionJoins Array of collection join entries recorded by QueryParser
 *   as it builds o2m/m2m joins. Each entry has the parent alias and the JoinTable
 *   reference.
 */
export function rewriteCollectionJoinsToExists(
  query: ParsedFindQuery,
  collectionJoins: { parentAlias: string; join: JoinTable }[] = [],
): void {
  if (collectionJoins.length === 0) return;

  // Build a set of all collection join aliases for quick lookup
  const collectionAliasSet = new Set(collectionJoins.map(({ join }) => join.alias));

  // Group collection joins by parent alias
  const childrenByParent = new Map<string, JoinTable[]>();
  for (const { parentAlias, join } of collectionJoins) {
    let children = childrenByParent.get(parentAlias);
    if (!children) {
      children = [];
      childrenByParent.set(parentAlias, children);
    }
    children.push(join);
  }

  // Find top-level collection roots: collection joins whose parent is NOT itself a collection alias.
  // These become the outermost EXISTS. Children of collection joins become nested EXISTS.
  const topLevelRoots: JoinTable[] = [];
  for (const { parentAlias, join } of collectionJoins) {
    if (!collectionAliasSet.has(parentAlias)) {
      topLevelRoots.push(join);
    }
  }
  if (topLevelRoots.length === 0) return;

  // Build subtrees: for each top-level root, collect all descendant join aliases
  // (including nested collection joins and their non-collection descendants like m2m target tables).
  const allJoins = query.tables.filter((t): t is JoinTable => t.join === "inner" || t.join === "outer");
  const rootForAlias = new Map<string, string>(); // alias → top-level root alias
  for (const root of topLevelRoots) {
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

  // All aliases that will be absorbed into EXISTS subqueries
  const allRewrittenAliases = new Set(rootForAlias.keys());

  // Track pruneable conditions (soft-delete/STI) per top-level root
  const pruneablePerRoot = new Map<string, ParsedExpressionCondition[]>();
  for (const root of topLevelRoots) {
    pruneablePerRoot.set(root.alias, []);
  }

  // Decompose the condition tree: extract conditions that belong to rewritten aliases
  const conditionsPerRoot = new Map<string, ParsedExpressionCondition[]>();
  for (const root of topLevelRoots) {
    conditionsPerRoot.set(root.alias, []);
  }

  function decomposeExpression(exp: ParsedExpressionFilter): ParsedExpressionFilter | undefined {
    const remaining: ParsedExpressionCondition[] = [];

    for (const c of exp.conditions) {
      // Pruneable conditions (soft-delete) go into the subquery WHERE
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
          // Only recursively decompose if ALL children map to the same scope.
          // If the expression has mixed roots (some inner, some outer), keep it intact
          // to preserve AND/OR semantics across scope boundaries.
          if (hasMultipleScopes(rootForAlias, c)) {
            remaining.push(c);
          } else {
            const rewritten = decomposeExpression(c);
            if (rewritten) remaining.push(rewritten);
          }
        } else {
          remaining.push(c);
        }
      } else {
        conditionsPerRoot.get(root)!.push(c);
      }
    }

    if (remaining.length === 0) return undefined;
    if (remaining.length === 1 && remaining[0].kind === "exp") return remaining[0];
    return { kind: "exp", op: exp.op, conditions: remaining };
  }

  // Decompose the top-level condition tree
  if (query.condition) {
    query.condition = decomposeExpression(query.condition);
  }

  // After decomposition, check if any remaining (non-decomposed) conditions reference
  // aliases that would be absorbed into EXISTS subqueries. If so, those roots cannot be
  // rewritten — their aliases must stay visible in the outer query.
  const taintedRoots = new Set<string>();
  if (query.condition) {
    const remainingAliases = new Set<string>();
    collectReferencedAliases(query.condition, remainingAliases);
    for (const alias of remainingAliases) {
      const root = rootForAlias.get(alias);
      if (root) taintedRoots.add(root);
    }
  }

  // For tainted roots, put their decomposed conditions back into the outer query
  if (taintedRoots.size > 0) {
    for (const rootAlias of taintedRoots) {
      const conds = conditionsPerRoot.get(rootAlias)!;
      const pruneable = pruneablePerRoot.get(rootAlias)!;
      if (query.condition) {
        query.condition.conditions.push(...conds, ...pruneable);
      } else {
        query.condition = { kind: "exp", op: "and", conditions: [...conds, ...pruneable] };
      }
      conditionsPerRoot.set(rootAlias, []);
      pruneablePerRoot.set(rootAlias, []);
    }
  }

  // Filter top-level roots to only those that aren't tainted
  const rewritableRoots = topLevelRoots.filter((r) => !taintedRoots.has(r.alias));

  // Recompute rewritten aliases excluding tainted subtrees
  const actualRewrittenAliases = new Set<string>();
  for (const [alias, root] of rootForAlias) {
    if (!taintedRoots.has(root)) actualRewrittenAliases.add(alias);
  }

  // Build EXISTS conditions per rewritable root, with nested EXISTS for child collections
  const existsConditions: ExistsCondition[] = [];
  const rootsWithExists = new Set<string>();

  for (const root of rewritableRoots) {
    const conditions = conditionsPerRoot.get(root.alias)!;
    const pruneableConditions = pruneablePerRoot.get(root.alias)!;
    const parentAlias = parseAlias(root.col1);

    const exists = buildExistsForRoot(
      root,
      parentAlias,
      conditions,
      pruneableConditions,
      childrenByParent,
      allJoins,
      query,
    );
    if (exists) {
      existsConditions.push(exists);
      rootsWithExists.add(root.alias);
    }
  }

  // Only remove aliases whose root actually produced an EXISTS condition.
  // Roots with no conditions (e.g. `books: {}`) should stay as regular joins
  // so that pruneJoins/keepAliases can handle them normally.
  const aliasesToRemove = new Set<string>();
  for (const [alias, root] of rootForAlias) {
    if (rootsWithExists.has(root)) aliasesToRemove.add(alias);
  }

  // Remove rewritten aliases from query.tables
  query.tables = query.tables.filter((t) => {
    if (t.join === "primary") return true;
    if (t.join === "lateral" || t.join === "cross") return true;
    // Keep non-collection outer joins (CTI/order-by joins have distinct: false)
    if (t.join === "outer" && t.distinct === false) return true;
    if (t.join === "inner" && !aliasesToRemove.has(t.alias)) return true;
    return !aliasesToRemove.has(t.alias);
  });

  // Add EXISTS conditions to the query's WHERE clause
  if (existsConditions.length > 0) {
    if (query.condition) {
      query.condition.conditions.push(...existsConditions);
    } else {
      query.condition = { kind: "exp", op: "and", conditions: existsConditions };
    }
  }
}

/**
 * Builds an ExistsCondition for a single collection join root, recursively
 * nesting child collection joins as inner EXISTS conditions.
 */
function buildExistsForRoot(
  root: JoinTable,
  parentAlias: string,
  conditions: ParsedExpressionCondition[],
  pruneableConditions: ParsedExpressionCondition[],
  childrenByParent: Map<string, JoinTable[]>,
  allJoins: JoinTable[],
  query: ParsedFindQuery,
): ExistsCondition | undefined {
  // Detect anti-join: all conditions are `id IS NULL` on the root alias
  const isAntiJoin =
    conditions.length > 0 &&
    conditions.every(
      (c) => c.kind === "column" && c.column === "id" && c.cond.kind === "is-null" && c.alias === root.alias,
    );

  // Correlation predicate: e.g., a.id = b.author_id
  const correlationCondition: RawCondition = {
    kind: "raw",
    aliases: [root.alias],
    condition: `${root.col1} = ${root.col2}`,
    bindings: [],
    pruneable: false,
  };

  // Find non-collection descendant joins (e.g., m2m target table joins)
  // These go as inner joins inside the EXISTS subquery
  const directDescendants = allJoins.filter((j) => {
    if (j.alias === root.alias) return false;
    const joinParentAlias = parseAlias(j.col1);
    return joinParentAlias === root.alias;
  });

  const innerJoins = directDescendants
    .filter((j) => !childrenByParent.has(j.alias))
    .map((j) => ({
      ...j,
      join: "inner" as const,
    }));

  // Build nested EXISTS for child collections of this root
  const childCollections = childrenByParent.get(root.alias) || [];
  const nestedExists: ExistsCondition[] = [];

  for (const child of childCollections) {
    // Find conditions that belong to this child's subtree
    const childConditions: ParsedExpressionCondition[] = [];
    const childPruneable: ParsedExpressionCondition[] = [];

    // Partition the root's conditions: those on the child's alias subtree go to the child
    const childAliases = new Set<string>();
    childAliases.add(child.alias);
    // Find all descendants of this child
    let childChanged = true;
    while (childChanged) {
      childChanged = false;
      for (const j of allJoins) {
        if (!childAliases.has(j.alias) && childAliases.has(parseAlias(j.col1))) {
          childAliases.add(j.alias);
          childChanged = true;
        }
      }
    }

    // Split conditions between those belonging to this child and those staying with the root
    const remainingConditions: ParsedExpressionCondition[] = [];
    for (const c of conditions) {
      if (conditionBelongsToAliases(c, childAliases)) {
        childConditions.push(c);
      } else {
        remainingConditions.push(c);
      }
    }
    // Replace conditions with the remaining ones (mutate in place for subsequent children)
    conditions.length = 0;
    conditions.push(...remainingConditions);

    // Same for pruneable conditions
    const remainingPruneable: ParsedExpressionCondition[] = [];
    for (const c of pruneableConditions) {
      if (conditionBelongsToAliases(c, childAliases)) {
        childPruneable.push(c);
      } else {
        remainingPruneable.push(c);
      }
    }
    pruneableConditions.length = 0;
    pruneableConditions.push(...remainingPruneable);

    const childExists = buildExistsForRoot(
      child,
      root.alias,
      childConditions,
      childPruneable,
      childrenByParent,
      allJoins,
      query,
    );
    if (childExists) nestedExists.push(childExists);
  }

  // Build the subquery WHERE clause
  const subqueryConditions: ParsedExpressionCondition[] = [correlationCondition];

  if (isAntiJoin) {
    // Anti-join: NOT EXISTS with just the correlation, no filter conditions
  } else {
    subqueryConditions.push(...conditions);
  }
  subqueryConditions.push(...pruneableConditions);
  subqueryConditions.push(...nestedExists);

  // If we have no conditions at all (besides correlation), and it's not an anti-join,
  // and there are no nested exists, skip creating this EXISTS
  if (!isAntiJoin && conditions.length === 0 && nestedExists.length === 0) {
    return undefined;
  }

  const subquery: ParsedFindQuery = {
    selects: ["1"],
    tables: [
      { join: "primary" as const, alias: root.alias, table: root.table },
      ...innerJoins,
    ],
    condition: { kind: "exp", op: "and", conditions: subqueryConditions },
    orderBys: [],
  };

  return {
    kind: "exists",
    negate: isAntiJoin,
    subquery,
    outerAliases: [parentAlias],
  };
}

/** Checks if an expression has conditions from multiple scopes (both inner and outer). */
function hasMultipleScopes(rootForAlias: Map<string, string>, exp: ParsedExpressionFilter): boolean {
  let hasInner = false;
  let hasOuter = false;
  for (const c of exp.conditions) {
    const aliases = new Set<string>();
    collectReferencedAliases(c, aliases);
    for (const a of aliases) {
      if (rootForAlias.has(a)) hasInner = true;
      else hasOuter = true;
    }
    if (hasInner && hasOuter) return true;
  }
  return false;
}

/** Collects all aliases referenced by a condition tree into the given set. */
function collectReferencedAliases(c: ParsedExpressionCondition, out: Set<string>): void {
  if (c.kind === "column") {
    out.add(c.alias);
  } else if (c.kind === "raw") {
    for (const a of c.aliases) out.add(a);
  } else if (c.kind === "exp") {
    for (const inner of c.conditions) collectReferencedAliases(inner, out);
  } else if (c.kind === "exists") {
    // EXISTS subqueries are self-contained; don't collect their inner aliases
  } else {
    assertNever(c);
  }
}

/** Checks whether a condition references only aliases in the given set. */
function conditionBelongsToAliases(c: ParsedExpressionCondition, aliases: Set<string>): boolean {
  if (c.kind === "column") {
    return aliases.has(c.alias);
  } else if (c.kind === "raw") {
    return c.aliases.every((a) => aliases.has(a));
  } else if (c.kind === "exp") {
    return c.conditions.every((inner) => conditionBelongsToAliases(inner, aliases));
  } else if (c.kind === "exists") {
    return false;
  } else {
    assertNever(c);
  }
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
      throw new Error("RawCondition spanning multiple collection paths is not supported with EXISTS rewrite");
    }
    return roots.size === 1 ? [...roots][0] : undefined;
  } else if (c.kind === "exp") {
    return getExpressionRoot(rootForAlias, c);
  } else if (c.kind === "exists") {
    return undefined;
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
