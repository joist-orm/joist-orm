import {
  type ExistsCondition,
  type JoinTable,
  maybeAddIdNotNulls,
  parseAlias,
  type ParsedExpressionCondition,
  type ParsedExpressionFilter,
  type ParsedFindQuery,
  type PrimaryTable,
  type RawCondition,
} from "./QueryParser";
import { pruneUnusedJoins, selectReferencesAlias } from "./QueryParser.pruning";
import { assertNever } from "./utils";

/**
 * Rewrites eligible logical collection LEFT JOINs into EXISTS after plugins have mutated the AST.
 *
 * QueryParser intentionally leaves collection filters as ordinary joins so `beforeFind` plugins see
 * stabler/simpler input than "sometimes JOINs / sometimes EXISTS".
 *
 * This pass runs after plugins and before SQL rendering:
 *
 * 1. `rewriteCollectionJoins` finds top-level collection joins and moves conditions that reference only
 *    that subtree into a correlated EXISTS subquery. I.e. `{ books: { title: "b1" } }` becomes
 *    `EXISTS (SELECT 1 FROM books b WHERE a.id = b.author_id AND b.title = 'b1')`.
 * 2. The same helper recurses into the generated subquery, so nested collections become nested EXISTS clauses.
 *    I.e. `{ books: { reviews: { rating: 5 } } }` becomes EXISTS(books WHERE EXISTS(reviews)).
 * 3. Conditions that cannot be safely moved stay as LEFT JOINs. I.e. `OR(b.title = 'x', a.first_name = 'x')`
 *    needs both aliases in one SQL scope, so `b` remains a join instead of becoming an EXISTS.
 * 4. Remaining fanout LEFT JOIN roots are rejected unless `allowMultipleLeftJoins` is set,
 *    because they can produce cross-product row explosions.
 * 5. Finally, `maybeAddIdNotNulls` and `pruneUnusedJoins` clean up the joins that remain.
 */
export function optimizeCollectionJoins(
  query: ParsedFindQuery,
  opts: { allowMultipleLeftJoins?: boolean; pruneJoins?: boolean; keepAliases?: string[] } = {},
): void {
  const { allowMultipleLeftJoins = false, pruneJoins = true, keepAliases = [] } = opts;
  for (const table of query.tables) {
    // I.e. batched find/count queries wrap the real query in a LATERAL subquery; optimize that inner query too,
    // but let the outer query decide final pruning so it can keep the lateral alias itself.
    if (table.join === "lateral") optimizeCollectionJoins(table.query, { ...opts, pruneJoins: false });
  }
  rewriteCollectionJoins(query, keepAliases);

  // I.e. collection LEFT JOINs now fall into three buckets:
  // 1. local real filters, like `{ books: { title: "b1" } }`, were rewritten to EXISTS above;
  // 2. no local real filters, like `{ books: {}, comments: {} }`, are safe because pruning will remove them;
  // 3. blocked real filters, like cross-scope ORs, must stay as LEFT JOINs and can multiply rows.
  // Only the third bucket should trip the fanout guard.
  const fanoutLeftJoinAliases = getTopLevelCollectionRoots(query)
    .filter((t) => conditionBlocksExistsRewrite(query.condition, collectJoinSubtreeAliases(query, t.alias)))
    .map((t) => t.alias);
  if (!allowMultipleLeftJoins && fanoutLeftJoinAliases.length > 1) {
    throw new Error(
      `em.find would issue multiple LEFT JOINs across collection relations (${fanoutLeftJoinAliases.join(
        ", ",
      )}); pass allowMultipleLeftJoins: true if this fanout is intentional`,
    );
  }

  if (query.tables.some((t) => t.join === "outer")) {
    // I.e. preserve legacy LEFT JOIN null semantics for any joins that could not become EXISTS.
    maybeAddIdNotNulls(query);
  }
  if (pruneJoins) {
    // I.e. remove logical collection joins that were replaced by EXISTS and any joins only needed before plugin edits.
    pruneUnusedJoins(query, keepAliases);
  }
}

/**
 * Rewrites root-level collection join subtrees into EXISTS when their conditions are locally scoped.
 *
 * I.e. for `authors a -> books b -> book_reviews br`, `b` is the collection root and `br` is part of its subtree.
 */
function rewriteCollectionJoins(query: ParsedFindQuery, keepAliases: string[] = []): void {
  rewriteSiblingOrConditions(query, keepAliases);
  for (const root of getTopLevelCollectionRoots(query)) {
    // I.e. for root `b`, this gathers `b`, `br`, and any other joins whose `col1` depends on that subtree.
    const subtreeAliases = collectJoinSubtreeAliases(query, root.alias);
    if (conditionHasCrossScopeReference(query.condition, subtreeAliases)) continue;
    // I.e. move `b.title = 'x'` and `(br.rating = 5 OR br.rating = 4)`, but not `b.title = 'x' OR a.first_name = 'x'`.
    const moved = query.condition ? removeLocallyScopedConditions(query.condition, subtreeAliases) : [];
    const hasOnlyAntiJoin = moved.length === 1 && isAliasIdNull(moved[0], root.alias);
    if (moved.length === 0 && !hasOnlyAntiJoin) continue;
    const exists = createExistsCondition(query, root, subtreeAliases, moved);
    if (!exists) {
      query.condition ??= { kind: "exp", op: "and", conditions: [] };
      query.condition.conditions.push(...moved);
      continue;
    }
    query.condition ??= { kind: "exp", op: "and", conditions: [] };
    query.condition.conditions.push(exists);
    // I.e. after adding EXISTS, remove `books b` and its children from the outer FROM list.
    query.tables = query.tables.filter((t) => !subtreeAliases.has(t.alias));
  }
  removeEmptyExpressions(query.condition);
}

/** Rewrites `b.id IS NOT NULL OR c.id IS NOT NULL` into sibling EXISTS clauses. */
function rewriteSiblingOrConditions(query: ParsedFindQuery, keepAliases: string[]): void {
  if (!query.condition) return;
  rewriteSiblingOrExpression(query, query.condition, keepAliases);
}

/** Rewrites eligible sibling collection ORs while preserving outer/mixed-scope ORs as joins. */
function rewriteSiblingOrExpression(query: ParsedFindQuery, condition: ParsedExpressionCondition, keepAliases: string[]): void {
  if (condition.kind !== "exp") return;
  if (condition.op === "or" && rewriteSiblingOrExpressionChildren(query, condition, keepAliases)) return;
  if (condition.op === "and") {
    for (const child of condition.conditions) rewriteSiblingOrExpression(query, child, keepAliases);
  }
}

/** Returns true when every OR branch became an EXISTS for one collection subtree. */
function rewriteSiblingOrExpressionChildren(
  query: ParsedFindQuery,
  exp: ParsedExpressionFilter,
  keepAliases: string[],
): boolean {
  const roots = getTopLevelCollectionRoots(query).map((root) => ({
    root,
    subtreeAliases: collectJoinSubtreeAliases(query, root.alias),
  }));
  const matches: { root: JoinTable; subtreeAliases: Set<string>; condition: ParsedExpressionCondition }[] = [];
  const usedAliases = new Set<string>();
  const usedRoots = new Set<string>();
  for (const condition of exp.conditions) {
    if (!isRealCondition(condition)) return false;
    const match = roots.find(({ subtreeAliases }) => conditionReferencesOnlyAliases(condition, subtreeAliases));
    if (!match) return false;
    matches.push({ ...match, condition });
    usedRoots.add(match.root.alias);
    for (const alias of match.subtreeAliases) usedAliases.add(alias);
  }
  // I.e. rewrite only true sibling collection ORs, like `b.id IS NOT NULL OR c.id IS NOT NULL`;
  // skip single-root ORs, aliases also filtered elsewhere like `b.order = 1 AND (b.title = 'x' OR c.text = 'x')`,
  // and aliases that must stay projected/sorted like `SELECT b.title` or `ORDER BY b.title`.
  if (
    usedRoots.size < 2 ||
    conditionReferencesAliasesOutside(query.condition, exp, usedAliases) ||
    queryReferencesAliasesOutsideConditions(query, usedAliases, keepAliases)
  ) {
    return false;
  }

  const existsConditions: ExistsCondition[] = [];
  for (const match of matches) {
    const exists = createExistsCondition(query, match.root, match.subtreeAliases, [match.condition]);
    if (!exists) return false;
    existsConditions.push(exists);
  }
  exp.conditions = existsConditions;
  // I.e. leave the collection joins in place for now; pruning removes them after all rewrites.
  return true;
}

/** Creates an EXISTS/NOT EXISTS condition for moved collection filters, or undefined when a LEFT JOIN must stay. */
function createExistsCondition(
  query: ParsedFindQuery,
  root: JoinTable,
  subtreeAliases: Set<string>,
  moved: ParsedExpressionCondition[],
): ExistsCondition | undefined {
  const hasOnlyAntiJoin = moved.length === 1 && isAliasIdNull(moved[0], root.alias);
  if (!hasOnlyAntiJoin && !moved.some(isRealCondition)) {
    // I.e. only soft-delete/STI conditions moved; don't create an EXISTS that changes nothing.
    return undefined;
  }
  if (moved.length > 0 && moved.some((c) => isAliasIdNull(c, root.alias)) && !hasOnlyAntiJoin) {
    // I.e. `b.id IS NULL AND b.title = 'x'` is not a pure anti-join; leave it as a LEFT JOIN for SQL semantics.
    return undefined;
  }

  const correlation: RawCondition = {
    kind: "raw",
    aliases: [root.alias],
    condition: `${root.col1} = ${root.col2}`,
    bindings: [],
    pruneable: false,
  };
  // I.e. a pure `b.id IS NULL` anti-join becomes `NOT EXISTS (SELECT 1 FROM books b WHERE a.id = b.author_id)`.
  const conditions = hasOnlyAntiJoin ? [correlation] : [correlation, ...moved];
  const subquery: ParsedFindQuery = {
    selects: ["1"],
    tables: query.tables.filter((t) => subtreeAliases.has(t.alias)).map((t) => {
      // I.e. the collection root becomes the subquery's FROM table; children remain joins off that root.
      if (t.alias === root.alias) return { join: "primary", alias: t.alias, table: t.table } satisfies PrimaryTable;
      // I.e. by this point every moved condition is locally scoped and positive, like `br.rating = 5`; pure
      // `br.id IS NULL` anti-joins are handled as NOT EXISTS at their own root, and mixed/null-sensitive cases stay
      // as outer joins. So inside this EXISTS, child rows must exist to satisfy the moved filters, and INNER JOIN is
      // equivalent to LEFT JOIN + WHERE child condition.
      if (t.join === "inner" || t.join === "outer") return { ...t, join: "inner" as const };
      return t;
    }),
    condition: { kind: "exp", op: "and", conditions },
    orderBys: [],
  };
  // I.e. nested `books.reviews` first creates an EXISTS for books, then this recursive call creates EXISTS for reviews.
  rewriteCollectionJoins(subquery);
  return {
    kind: "exists",
    negate: hasOnlyAntiJoin,
    correlation,
    joinColumns: { col1: root.col1, col2: root.col2 },
    subquery,
    outerAliases: [root.collection!.parentAlias],
  };
}

/** Returns top-level collection roots, i.e. `books b` but not nested `book_reviews br`. */
function getTopLevelCollectionRoots(query: ParsedFindQuery): JoinTable[] {
  // I.e. if `books b` is nested under another collection root, the parent pass should absorb it; don't rewrite it here.
  const collectionAliases = new Set(
    query.tables
      .filter((t): t is JoinTable => t.join === "inner" || t.join === "outer")
      .flatMap((t) => (t.collection ? [t.alias] : [])),
  );
  return query.tables.filter(
    (t) =>
      (t.join === "inner" || t.join === "outer") &&
      t.collection?.rootAlias === t.alias &&
      !collectionAliases.has(t.collection.parentAlias),
  ) as JoinTable[];
}

/** Returns true if a remaining real condition prevents this subtree from becoming EXISTS, i.e. a cross-scope OR. */
function conditionBlocksExistsRewrite(condition: ParsedExpressionCondition | undefined, aliases: Set<string>): boolean {
  if (!condition || !isRealCondition(condition)) return false;
  if (condition.kind === "exp" && condition.op === "and") {
    return condition.conditions.some((c) => conditionBlocksExistsRewrite(c, aliases));
  }
  const found = new Set<string>();
  collectAllAliases(condition, found);
  return [...found].some((alias) => aliases.has(alias));
}

/** Collects a collection root and all joins that depend on it, i.e. `b -> br -> c`. */
function collectJoinSubtreeAliases(query: ParsedFindQuery, rootAlias: string): Set<string> {
  const aliases = new Set([rootAlias]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const table of query.tables) {
      if (table.join !== "inner" && table.join !== "outer") continue;
      // I.e. `book_reviews br ON b.id = br.book_id` depends on `b`, so `br` belongs in the `b` subtree.
      if (!aliases.has(table.alias) && aliases.has(parseAlias(table.col1))) {
        aliases.add(table.alias);
        changed = true;
      }
    }
  }
  return aliases;
}

/**
 * Removes AND-safe conditions whose aliases all live inside one collection subtree.
 *
 * I.e. in `a.age = 1 AND b.title = 'x'`, only `b.title = 'x'` moves. In `b.title = 'x' OR br.rating = 5`,
 * the whole OR moves only if every alias is inside the same subtree.
 */
function removeLocallyScopedConditions(exp: ParsedExpressionFilter, aliases: Set<string>): ParsedExpressionCondition[] {
  if (exp.op === "or") {
    // I.e. OR cannot be split across scopes; either move the whole OR into the EXISTS, or leave it outside.
    if (!conditionReferencesOnlyAliases(exp, aliases)) return [];
    const moved = { ...exp, conditions: [...exp.conditions] } satisfies ParsedExpressionFilter;
    exp.conditions = [];
    return [moved];
  }
  const moved: ParsedExpressionCondition[] = [];
  for (let i = exp.conditions.length - 1; i >= 0; i--) {
    const condition = exp.conditions[i];
    if (condition.kind === "exp" && condition.op === "and") {
      // I.e. flatten nested AND movement so `a AND (b AND br)` can still move `b` and `br` into the EXISTS.
      moved.push(...removeLocallyScopedConditions(condition, aliases));
      if (condition.conditions.length === 0) exp.conditions.splice(i, 1);
    } else if (conditionReferencesOnlyAliases(condition, aliases)) {
      // I.e. move `b.title = 'x'` out of the parent AND and into the collection EXISTS.
      moved.unshift(condition);
      exp.conditions.splice(i, 1);
    }
  }
  return moved;
}

/** Returns true when a condition references at least one alias and all aliases are in `aliases`, i.e. only `b`/`br`. */
function conditionReferencesOnlyAliases(condition: ParsedExpressionCondition, aliases: Set<string>): boolean {
  const found = new Set<string>();
  collectAllAliases(condition, found);
  return found.size > 0 && [...found].every((alias) => aliases.has(alias));
}

/** Returns true when `aliases` are referenced by a real condition other than the targeted OR expression. */
function conditionReferencesAliasesOutside(
  condition: ParsedExpressionCondition | undefined,
  target: ParsedExpressionCondition,
  aliases: Set<string>,
): boolean {
  if (!condition || condition === target || !isRealCondition(condition)) return false;
  if (condition.kind === "exp") {
    return condition.conditions.some((child) => conditionReferencesAliasesOutside(child, target, aliases));
  }
  return conditionReferencesAnyAlias(condition, aliases);
}

/** Returns true when selected/ordered aliases would force these joins to remain in the outer query. */
function queryReferencesAliasesOutsideConditions(
  query: ParsedFindQuery,
  aliases: Set<string>,
  keepAliases: string[],
): boolean {
  if (keepAliases.some((alias) => aliases.has(alias))) return true;
  if (query.orderBys.some((orderBy) => aliases.has(orderBy.alias))) return true;
  if (query.groupBys?.some((groupBy) => aliases.has(groupBy.alias))) return true;
  return query.selects.some((select) => {
    if (typeof select === "string") return [...aliases].some((alias) => selectReferencesAlias(select, alias));
    if ("aliases" in select) return select.aliases.some((alias) => aliases.has(alias));
    return false;
  });
}

/** Returns true when a condition references this subtree and another scope, i.e. `b.title = 'x' OR c.text = 'x'`. */
function conditionHasCrossScopeReference(condition: ParsedExpressionCondition | undefined, aliases: Set<string>): boolean {
  if (!condition || !isRealCondition(condition)) return false;
  if (condition.kind === "exp" && condition.op === "and") {
    return condition.conditions.some((child) => conditionHasCrossScopeReference(child, aliases));
  }
  return conditionReferencesAnyAlias(condition, aliases) && !conditionReferencesOnlyAliases(condition, aliases);
}

/** Returns true when a condition references any alias in `aliases`, i.e. `b` in `b.title = c.text`. */
function conditionReferencesAnyAlias(condition: ParsedExpressionCondition, aliases: Set<string>): boolean {
  const found = new Set<string>();
  collectAllAliases(condition, found);
  return [...found].some((alias) => aliases.has(alias));
}

/** Returns true for `alias.id IS NULL`, i.e. the parse shape for `{ books: { id: null } }`. */
function isAliasIdNull(condition: ParsedExpressionCondition, alias: string): boolean {
  return (
    condition.kind === "column" &&
    condition.alias === alias &&
    condition.column === "id" &&
    condition.cond.kind === "is-null"
  );
}

/** Removes empty expression wrappers left behind by condition movement, i.e. `AND []` after all children moved. */
function removeEmptyExpressions(exp: ParsedExpressionFilter | undefined): void {
  if (!exp) return;
  for (let i = exp.conditions.length - 1; i >= 0; i--) {
    const condition = exp.conditions[i];
    if (condition.kind === "exp") {
      removeEmptyExpressions(condition);
      if (condition.conditions.length === 0) exp.conditions.splice(i, 1);
    }
  }
}

/** Returns true if a condition must be preserved to maintain query semantics, i.e. user filters vs soft-delete filters. */
function isRealCondition(condition: ParsedExpressionCondition): boolean {
  if (condition.kind === "column" || condition.kind === "raw") {
    return !condition.pruneable;
  } else if (condition.kind === "exists") {
    return true;
  } else if (condition.kind === "exp") {
    return condition.conditions.some(isRealCondition);
  } else {
    assertNever(condition);
  }
}

/** Collects all aliases referenced by a condition, including inside nested expressions, i.e. `b` and `a` in an OR. */
function collectAllAliases(cond: ParsedExpressionCondition, out: Set<string>): void {
  if (cond.kind === "column") {
    out.add(cond.alias);
  } else if (cond.kind === "raw") {
    for (const a of cond.aliases) out.add(a);
  } else if (cond.kind === "exp") {
    for (const c of cond.conditions) collectAllAliases(c, out);
  } else if (cond.kind === "exists") {
    // I.e. an EXISTS subquery is already a scoped unit; outer movement decisions should not inspect its internals.
  } else {
    assertNever(cond);
  }
}
