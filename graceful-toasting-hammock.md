# Rewrite o2m/m2m conditions to LATERAL + BOOL_OR

## Context

`em.find(Author, { books: ..., tags: ... })` JOINs both collections → `|books| × |tags|` row explosion in DB. DISTINCT dedupes wire results but DB still materializes the cross-product.

**Goal**: Replace collection JOINs with LATERAL subqueries that GROUP BY per branch, producing one row per parent with BOOL_OR columns. Top-level WHERE references these columns. No cross-product, no DISTINCT needed.

**Before**:
```sql
SELECT DISTINCT ON (a.id) a.*
FROM authors a
LEFT JOIN books b ON a.id = b.author_id
LEFT JOIN author_to_tags at ON a.id = at.author_id
LEFT JOIN tags t ON at.tag_id = t.id
WHERE b.title = 'b1' AND b.order = 1 AND t.name = 't1'
```

**After**:
```sql
SELECT a.*
FROM authors a
CROSS JOIN LATERAL (
  SELECT BOOL_OR("b"."title" = ? AND "b"."order" = ?) as _cond0
  FROM books b WHERE b.author_id = a.id
) _books
CROSS JOIN LATERAL (
  SELECT BOOL_OR("t"."name" = ?) as _cond1
  FROM tags t
  JOIN author_to_tags at ON at.tag_id = t.id
  WHERE at.author_id = a.id
) _tags
WHERE _books._cond0 AND _tags._cond1
```

Each collection → one lateral → one row per parent → no cross-product.

Same-level AND conditions for one collection go inside a single `BOOL_OR(c1 AND c2)` → "same row" semantics preserved.

## Decisions (locked in)

- **Multi-collection only**: Only rewrite when 2+ collection roots exist. Single-collection queries keep existing JOIN + DISTINCT behavior.
- **No orderBy on collections**: Not supported, no special handling needed.
- **No escape hatch**: Always rewrite when applicable.
- **Anti-join**: Use `count(*) = 0` in lateral (not EXISTS/NOT EXISTS).
- **Soft-delete**: Goes in lateral WHERE (never consider deleted entities), not inside BOOL_OR.

## New AST types

### `BoolOrSelect` (new select type)

```ts
export interface BoolOrSelect {
  kind: "bool_or";
  as: string;                          // column alias, e.g. "_cond0"
  condition: ParsedExpressionFilter;   // structured AST inside BOOL_OR
}
```

Added to `ParsedSelect` union: `string | ParsedSelectWithBindings | BoolOrSelect`.

Keeps inner conditions structured so batching `collectAndReplaceArgs`/`collectValues` visitors can see and rewrite inner `ColumnCondition` nodes (e.g., replacing values with `_find.argN`).

## Algorithm (new file: `QueryParser.lateralRewrite.ts`)

`rewriteCollectionJoinsToLateral(query)`:

1. **Identify collection joins**: `join === "outer" && distinct !== false`
2. **Build parent map**: parse `col1` → parent alias for each join
3. **Find collection roots**: collection joins whose parent is the primary alias
4. **Early exit**: if < 2 collection roots, skip rewrite
5. **Build subtrees**: for each root, collect all descendant joins (m2m targets, m2o within collection, nested o2m, etc.)
6. **Walk condition tree recursively** (bottom-up): tag each leaf with its collection path
7. **At each AND/OR node**: group children by collection path
   - Root-only → stay in place
   - Same-path siblings → single `BoolOrSelect` with conditions combined by the node's operator (AND→AND inside BOOL_OR, OR→OR inside BOOL_OR)
   - Cross-path compound → recursively decompose: each single-path child gets its own `BoolOrSelect` in the appropriate lateral; rewritten compound stays in main WHERE referencing lateral columns
   - Raw condition spanning multiple collection paths → error
8. **Build `LateralJoinTable`** per collection root:
   - `tables`: collection root as primary, descendants as inner joins
   - `selects`: the `BoolOrSelect`s for this collection
   - `condition`: correlation predicate (`b.author_id = a.id`) + soft-delete/STI conditions
9. **Replace conditions** in main WHERE with `RawCondition` refs to lateral columns (e.g., `_books._cond0`)
10. **Remove** original collection joins from `query.tables`, add laterals

### Nested collections (books → reviews)

Reviews lateral nested INSIDE books lateral:

```sql
CROSS JOIN LATERAL (
  SELECT BOOL_OR("b"."title" = ? AND _reviews._r_cond) as _b_cond
  FROM books b
  CROSS JOIN LATERAL (
    SELECT BOOL_OR("r"."rating" > ?) as _r_cond
    FROM reviews r WHERE r.book_id = b.id
  ) _reviews
  WHERE b.author_id = a.id
) _books
```

Inner laterals aggregate per-parent at each level. Outer BOOL_OR references inner lateral columns.

### Anti-join (`{ books: false }`)

Use `count(*) = 0`:
```sql
CROSS JOIN LATERAL (
  SELECT count(*) = 0 as _no_books FROM books b WHERE b.author_id = a.id
) _books
WHERE _books._no_books
```

## Call site in `parseFindQuery` (QueryParser.ts ~line 547)

```
cb.toExpressionFilter()
→ rewriteCollectionJoinsToLateral(query)   ← NEW
→ maybeAddIdNotNulls(query)                ← only remaining outer joins
→ pruneUnusedJoins(query)                  ← cleans up leftovers
```

Pruneable soft-delete conditions referencing collection aliases get moved into the lateral's `condition` (WHERE clause of the subquery, not inside BOOL_OR).

## SQL rendering changes (`buildRawQuery.ts`)

Handle `BoolOrSelect` in the select rendering loop:

```ts
if (typeof s === "object" && "kind" in s && s.kind === "bool_or") {
  const inner = buildWhereClause(s.condition, true);
  sql += `BOOL_OR(${inner[0]}) as ${kq(s.as)}`;
  bindings.push(...inner[1]);
}
```

Lateral rendering already exists (line 89-92). No changes needed there.

## Visitor/pruning updates

**`QueryVisitor.ts`** — `visitConditions`: add traversal of `BoolOrSelect` conditions in selects:
```ts
for (const s of query.selects) {
  if (typeof s !== "string" && "kind" in s && s.kind === "bool_or") {
    visitFilter(s.condition, visitor);
  }
}
```

This ensures batching (`collectAndReplaceArgs`, `collectValues`, `stripValues`) can rewrite conditions inside BOOL_OR. Correlated lateral subqueries can reference `_find.argN` from the outer CROSS JOIN.

**`QueryParser.pruning.ts`** — `deepFindConditions`: handle `BoolOrSelect` in selects (check lateral subquery selects for condition aliases). The laterals' own alias will be kept by the main WHERE's `RawCondition` references.

## Files to modify

| File | Change |
|------|--------|
| `packages/core/src/QueryParser.ts` | Add `BoolOrSelect` to `ParsedSelect` union. Call `rewriteCollectionJoinsToLateral`. |
| **`packages/core/src/QueryParser.lateralRewrite.ts`** | **New file.** Core rewrite algorithm. |
| `packages/core/src/QueryVisitor.ts` | Visit `BoolOrSelect` conditions in selects during `visitConditions`. |
| `packages/core/src/QueryParser.pruning.ts` | Handle `BoolOrSelect` in `deepFindConditions`. |
| `packages/core/src/drivers/buildRawQuery.ts` | Render `BoolOrSelect` as `BOOL_OR(sql) as alias`. |

## Implementation steps

### Step 1: AST — `BoolOrSelect` type

In `QueryParser.ts`, add the `BoolOrSelect` interface and extend the `ParsedSelect` union.

### Step 2: Core algorithm — `QueryParser.lateralRewrite.ts`

**2a. Identify collection roots**: Scan `query.tables` for `join === "outer" && distinct !== false`, parse `col1` to get parent alias. Roots = those whose parent is the primary alias. Early exit if < 2 roots.

**2b. Build subtrees per root**: For each root, collect all descendant joins by following alias chains.

**2c. Tag conditions with collection paths**: Walk condition tree bottom-up. Each leaf's alias maps to a collection root (or to root-only if it's the primary alias).

**2d. Decompose condition tree**: At each AND/OR node, group by path. Same-path siblings → single `BoolOrSelect`. Cross-path → per-path `BoolOrSelect`s + main WHERE with RawCondition refs.

**2e. Build `LateralJoinTable` per root**: Primary = root join. Inner joins = descendants. Selects = BoolOrSelects. WHERE = correlation + soft-delete.

**2f. Patch main query**: Remove collection joins, add laterals, replace conditions with RawCondition refs.

### Step 3: Render `BoolOrSelect` in `buildRawQuery.ts`

Add third branch in select rendering loop for `kind: "bool_or"`.

### Step 4: Update `QueryVisitor.ts`

Traverse `BoolOrSelect` conditions in selects so batching visitors work.

### Step 5: Update `QueryParser.pruning.ts`

`deepFindConditions` and `DependencyTracker` must handle `BoolOrSelect` in selects.

### Step 6: Wire into `parseFindQuery`

Call `rewriteCollectionJoinsToLateral(query)` after `cb.toExpressionFilter()`, before `maybeAddIdNotNulls`.

### Step 7: Tests

| Scenario | What to verify |
|----------|---------------|
| `{ books: ..., tags: ... }` | Lateral per collection, no DISTINCT, correct results |
| `{ books: { title: "x", order: 1 } }` (single collection) | **Not** rewritten (< 2 roots) |
| `AND(b.title, b.order)` with 2+ collections | Single `BOOL_OR(title AND order)` — same-row semantics |
| `{ books: { reviews: ... }, tags: ... }` | Nested lateral inside books lateral |
| M2M `{ tags: { name: "t1" }, books: ... }` | Lateral with junction + target joins |
| Anti-join `{ books: false, tags: ... }` | Lateral with count(*) = 0 |
| Cross-path OR `{ or: [b.title, t.name] }` | Per-path BoolOrSelects inside OR |
| Batching | `collectAndReplaceArgs` works through BoolOrSelect conditions |
| Existing test suite | `yarn test-stock` passes |

## Limitation

`RawCondition` spanning multiple collection paths → error. Same-path conditions split across nesting levels (flat + inside cross-path compound) → separate BOOL_ORs, "any-match" not "same-row."
