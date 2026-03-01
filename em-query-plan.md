currently our joist-orm only has high-level em.find APIs in @packages/core/src/EntityManager.ts , see tests in
  @packages/tests/integration/src/EntityManager.queries.test.ts , that is limited to loading entities, and we don't support SQL
  features like groupby, aggregates, etc. this has been fine, but now i want a plan to support these lower-level queries, that could
  fetch either entities (with more complicated queries) or just raw POJOs, via a new EntityManager.query(...) method.

the goal is to provide a query-builder, which is technically similar to drizzle or kysely or prisma, but with a very different api: no fluent method calls, which is archiac java-style builder patterns. instead we should lean into TypeScript's ability to "create strongly typed structures" from just POJOs of lists & object literals.

this is similar to our em.find API, which takes object literals, instead of being fluent.

the goal for the em.query API is:

- use our existing alias support, like `const [a, b] = aliases(Author, Book)` for the initial type safety
- leveraging condition/join/clause pruning, similar to `em.find` to support dynamic queries but with a fundamentally static structures
- support group bys, aggregations, and CTEs, all with appropriate strongly-typed object literal conventions/structures
- support `await em.query(...)` returning strongly-typed POJOs from the query, regardless of its group bys/aggregations/subqueries/etc.
- we should ideally support 90% of the custom/raw SQL queries an application would want to do, although we don't have to support "ltierally everything"
- we are only focused on postgresql, so lean into pg for simplification

---

## Proposed API Design

### Core Idea

`em.query(...)` takes a single object literal describing the full query. The `select` clause
determines the return type: selecting a bare alias returns entities; selecting a `{ key: expr }`
object returns typed POJOs.

### Aliases (reuse existing)

```ts
const [a, b] = aliases(Author, Book);
```

Aliases already carry per-field type info via `Alias<T>` → `PrimitiveAlias<V, N>` / `EntityAlias<T>`.
We reuse them as both column references (in select/groupBy/orderBy) and condition builders
(in where/having), exactly like `em.find` does today.

### Return Type Inference

The `select` clause drives the result type via conditional types:

```ts
// Entity mode — selecting a bare alias returns loaded entities
const authors = await em.query({ select: a, from: a, ... });
// → Author[]

// POJO mode — selecting an object of named expressions returns typed POJOs
const stats = await em.query({
  select: { name: a.firstName, bookCount: count() },
  from: a, ...
});
// → { name: string; bookCount: number }[]
```

Type extraction from selectables (no changes to existing alias interfaces needed):

```ts
// Extract the value type from a selectable expression
type SelectableType<S> =
  S extends PrimitiveAlias<infer V, infer N> ? V | (N extends null ? null : never) :
  S extends EntityAlias<infer T> ? IdOf<T> | null :
  S extends Expr<infer R> ? R :
  S extends Alias<infer T> ? T :  // bare alias = entity
  never;

// Infer the full result row from a select object
type QueryResult<S> =
  S extends Alias<infer T> ? T :                          // entity mode
  { [K in keyof S]: SelectableType<S[K]> };               // POJO mode
```

TS can infer `V` and `N` from `PrimitiveAlias<V, N>` via the structural method signatures
(e.g. `eq(value: V | N | ...)`), so this works without adding phantom types.

### Full API Shape

```ts
em.query<S>(query: {
  select: S;
  from: Alias<any>;
  join?: JoinClause[];
  where?: ExpressionFilter;    // reuse existing type
  groupBy?: Groupable[];
  having?: ExpressionFilter;
  orderBy?: Orderable[];
  limit?: number;
  offset?: number;
  distinct?: boolean;
}): Promise<QueryResult<S>[]>
```

### Example Queries

**1. Entity mode — complex WHERE returning entities**

```ts
const [a, b] = aliases(Author, Book);
const authors = await em.query({
  select: a,
  from: a,
  join: [a.on(b.author)],
  where: { and: [b.title.like("%bestseller%"), a.age.gte(30)] },
});
// → Author[]  (uses identity map for final return value only)
```

**2. Simple aggregation**

```ts
const [a, b] = aliases(Author, Book);
const stats = await em.query({
  select: { author: a.firstName, bookCount: count() },
  from: a,
  join: [a.leftOn(b.author)],
  groupBy: [a.firstName],
  orderBy: [desc(count())],
  limit: 10,
});
// → { author: string; bookCount: number }[]
```

**3. Multiple aggregates**

```ts
const [a] = aliases(Author);
const stats = await em.query({
  select: {
    avgAge: avg(a.age),
    maxAge: max(a.age),
    total: count(),
  },
  from: a,
  where: { and: [a.age.gt(0)] },
});
// → { avgAge: number | null; maxAge: number | null; total: number }[]
```

**4. GROUP BY with HAVING**

```ts
const [a, b] = aliases(Author, Book);
const prolific = await em.query({
  select: { authorId: a.id, bookCount: count() },
  from: a,
  join: [a.on(b.author)],
  groupBy: [a.id],
  having: { and: [count().gt(5)] },
});
// → { authorId: AuthorId; bookCount: number }[]
```

**5. Subquery in WHERE (exists / in)**

```ts
const [a, b] = aliases(Author, Book);
const sq = subquery({
  select: b.author,         // selects the FK column
  from: b,
  where: { and: [b.title.like("%epic%")] },
});
const authors = await em.query({
  select: a,
  from: a,
  where: { and: [a.id.in(sq)] },
});
// → Author[]
```

**6. CTE**

```ts
const [a] = aliases(Author);
const activeAuthors = cte("active", {
  select: { id: a.id, name: a.firstName },
  from: a,
  where: { and: [a.age.gte(18)] },
});
// activeAuthors is a typed CTE alias with .id and .name fields

const results = await em.query({
  with: [activeAuthors],
  select: { name: activeAuthors.name },
  from: activeAuthors,
  orderBy: [asc(activeAuthors.name)],
});
// → { name: string }[]
```

**7. Dynamic / conditional query building (pruning)**

```ts
const [a] = aliases(Author);
// undefined conditions are pruned, same as em.find
const nameFilter: string | undefined = req.query.name;
const ageFilter: number | undefined = req.query.minAge;

const results = await em.query({
  select: { name: a.firstName, age: a.age },
  from: a,
  where: { and: [a.firstName.eq(nameFilter), a.age.gte(ageFilter)] },
  orderBy: [asc(a.firstName)],
});
```

### Joins

Joins are expressed as methods on the alias, not free-standing functions. The target
alias (already in the query) calls `.on()` or `.leftOn()` with an `EntityAlias` FK
reference from the alias being joined.

```ts
// a.on(b.author) means: "join b's table, using b.author FK → a.id"
a.on(b.author)        // INNER JOIN books b ON b.author_id = a.id
a.leftOn(b.author)    // LEFT JOIN books b ON b.author_id = a.id
```

The system sees: `b.author` is an `EntityAlias<Author>` from `Alias<Book>`, so it knows
to JOIN the `books` table and use `author_id = a.id` as the ON clause.

For self-joins:

```ts
const [a1, a2] = [alias(Author), alias(Author)];
// a1.on(a2.mentor) = JOIN authors a2 ON a2.mentor_id = a1.id
join: [a1.on(a2.mentor)]
```

This requires adding `.on()` and `.leftOn()` methods to the `Alias<T>` proxy. These
methods accept an `EntityAlias<T>` (where T matches the alias's entity type) and return
a `JoinClause`. Internally, the proxy intercepts `.on`/`.leftOn` like it intercepts field
access, but returns a join descriptor instead of a condition.

We also need to extend `EntityAlias.eq()` to accept another alias for arbitrary join
conditions, mirroring what `PrimitiveAlias.eq()` already supports.

### Aggregate & Expression Types

```ts
// Each returns Expr<R> which carries the result type and generates SQL
function count(): Expr<number>;
function count(col: PrimitiveAlias<any, any>): Expr<number>;
function countDistinct(col: PrimitiveAlias<any, any>): Expr<number>;
function sum<V extends number | bigint>(col: PrimitiveAlias<V, any>): Expr<number | null>;
function avg(col: PrimitiveAlias<number, any>): Expr<number | null>;
function min<V>(col: PrimitiveAlias<V, any>): Expr<V | null>;
function max<V>(col: PrimitiveAlias<V, any>): Expr<V | null>;
function arrayAgg<V>(col: PrimitiveAlias<V, any>): Expr<V[]>;
function stringAgg(col: PrimitiveAlias<string, any>, delimiter: string): Expr<string | null>;
function coalesce<V>(col: PrimitiveAlias<V, any>, fallback: V): Expr<V>;

// Expr<R> also has condition methods for use in HAVING
interface Expr<R> {
  eq(value: R | undefined): ExpressionCondition;
  ne(value: R | undefined): ExpressionCondition;
  gt(value: R | undefined): ExpressionCondition;
  gte(value: R | undefined): ExpressionCondition;
  lt(value: R | undefined): ExpressionCondition;
  lte(value: R | undefined): ExpressionCondition;
}

// Raw expression escape hatch, user provides SQL + bindings + declares the TS type
function rawExpr<R>(sql: string, bindings?: any[]): Expr<R>;

// Order helpers
function asc(col: PrimitiveAlias<any, any> | Expr<any>): Orderable;
function desc(col: PrimitiveAlias<any, any> | Expr<any>): Orderable;
```

### Under the Hood: New `ParsedRawQuery` AST

`em.query` gets its own dedicated AST, separate from `ParsedFindQuery`. The `em.find`
AST has concerns specific to entity loading (DISTINCT ON for o2m, lateral joins for
preloading, cross joins for batching) that don't apply here.

```ts
interface ParsedRawQuery {
  selects: ParsedRawSelect[];
  from: { alias: string; table: string };
  joins: ParsedRawJoin[];
  where?: ParsedExpressionFilter;   // reuse existing condition types
  groupBy?: string[];               // SQL fragments, e.g. `a."first_name"`
  having?: ParsedExpressionFilter;  // same shape as where
  orderBy?: ParsedRawOrderBy[];
  limit?: number;
  offset?: number;
  distinct?: boolean;
  ctes?: ParsedRawCte[];
}

interface ParsedRawSelect {
  sql: string;          // e.g. `a."first_name"`, `count(*)`, `sum(a."age")`
  as: string;           // the key name from the user's select object
  bindings: any[];
}

interface ParsedRawJoin {
  type: "inner" | "left";
  alias: string;
  table: string;
  on: string;           // e.g. `b."author_id" = a."id"`
}

interface ParsedRawOrderBy {
  sql: string;          // e.g. `a."first_name"`, `count(*)`
  direction: "ASC" | "DESC";
}

interface ParsedRawCte {
  name: string;
  columns?: string[];
  query: ParsedRawQuery;
}
```

**What we reuse from existing infra:**
- `ParsedExpressionFilter`, `ColumnCondition`, `RawCondition` — the condition tree types
  and `buildWhereClause()` work identically for WHERE and HAVING
- `ConditionBuilder` — for processing `ExpressionFilter` user input
- `kq()` / `kqDot()` — keyword quoting helpers
- Alias deferred-binding callback system — keep it for consistency; `parseRawQuery()`
  calls `setAlias()` on each alias as it assigns SQL aliases from the from/join list
- `mapToDb()` — value mapping (enums → ints, tagged ids → numbers, etc.)

**What is new:**
1. **`parseRawQuery()`** — converts the query object literal into `ParsedRawQuery`.
   Walks the select/join/where/groupBy/having/orderBy, resolving alias columns via
   metadata, calling `setAlias()` on each alias.

2. **`buildRawQuerySql()`** — new SQL generator for `ParsedRawQuery`. Simpler than
   `buildRawQuery` since it doesn't handle DISTINCT ON, lateral joins, etc. Generates:
   `[WITH ...] SELECT ... FROM ... [JOIN ...] [WHERE ...] [GROUP BY ...] [HAVING ...] [ORDER BY ...] [LIMIT ...] [OFFSET ...]`

3. **`Expr<R>` runtime class** — carries SQL generation info (function name, column ref,
   bindings) and exposes `.gt()` / `.gte()` / etc. for HAVING conditions. An `Expr` is a
   stable object that generates the same SQL fragment wherever it's used (select, having,
   orderBy).

4. **`Alias.on()` / `Alias.leftOn()`** — new methods on the alias proxy that return
   `JoinClause` descriptors. Intercepted in the proxy's `get` handler alongside field access.

5. **Result mapping** — entity mode: run rows through `em.hydrate()`, look up in identity
   map for the return value (but no clause evaluation against in-memory state). POJO mode:
   map columns back to select keys, return plain objects.

**No batching** — `em.query` always executes a single SQL statement. These are inherently
custom queries, too unique to batch.

### What We Explicitly Defer (future extensions)

- `UNION` / `INTERSECT` / `EXCEPT`
- Window functions (`OVER`, `PARTITION BY`)
- `FILTER (WHERE ...)` on aggregates
- `DISTINCT ON`
- Recursive CTEs authored by the user (internal recursive CTE support already exists)
- Returning entities from JOINed aliases (e.g. select both Author and Book as entities)

### Gaps Found From Real-World Samples

These came from analyzing `em-query-sample-*.ts` files against the proposed API:

**1. `rawCondition()` standalone function** (sample-1, sample-approvals)
Full-text search (`ts_search @@ plainto_tsquery(?)`) and dynamic poly component NOT NULL
checks need raw SQL conditions not tied to a specific alias field. Need:
```ts
function rawCondition(sql: string, bindings: any[], aliases: Alias<any>[]): ExpressionCondition;
```
This is similar to the existing `RawCondition` type but exposed as a user-facing helper.

**2. Non-FK join conditions** (sample-bid-contract-items)
`bcli.item_template_item_id = iti.bid_item_template_item_id` is not a standard FK→PK join.
`.on()` and `.leftOn()` must also accept an `ExpressionCondition` for arbitrary ON clauses:
```ts
// FK-based (common case)
a.on(b.author)
// Arbitrary condition
bcli.leftOn(bcli.itemTemplateItem.eq(iti.bidItemTemplateItem))
```
This also requires extending `EntityAlias.eq()` to accept another `EntityAlias` for
cross-column FK comparisons.

**3. Entity mode + GROUP BY + aggregate ORDER BY** (sample-bills)
Entity mode (`select: b`) with `groupBy: [b.id]` and `orderBy: [desc(sum(bli.amountInCents))]`.
PG allows this since the PK functionally determines all columns. This is a valid combo that
the API already supports — no changes needed, just confirming it works.

**4. `rawExpr<R>()` in orderBy** (sample-bills)
Compound expressions like `SUM(bli.amount_in_cents) - b.quickbooks_amount_paid_in_cents`
can't be built from primitive aggregate helpers. `rawExpr<R>(sql, bindings)` needs to work
in `orderBy`, not just `select`. Already in the plan but confirming it's needed.

**5. `nin()` on aliases** (sample-bid-contract-items)
The original uses `.whereNotIn(...)`. Our `PrimitiveAlias` has `in()` but not `nin()`.
`EntityAlias` needs `nin()` too. (Note: the em.find `ValueFilter` already supports `{ nin: ... }`
via inline conditions, but the alias condition builder doesn't expose it yet.)

### Test Plan

Tests go in a new `EntityManager.query.test.ts` alongside the existing `EntityManager.queries.test.ts`.
Use the existing test entities (Author, Book, Publisher, Comment, Tag, etc.).

**Core functionality:**

```ts
// 1. Entity mode — returns entities via identity map
it("can query entities with simple where", async () => {
  await insertAuthor({ first_name: "a1" });
  await insertAuthor({ first_name: "a2" });
  const em = newEntityManager();
  const [a] = aliases(Author);
  const authors = await em.query({ select: a, from: a, where: { and: [a.firstName.eq("a1")] } });
  expect(authors).toMatchEntity([{ firstName: "a1" }]);
});

// 2. POJO mode — returns typed plain objects
it("can query POJO with selected columns", async () => {
  await insertAuthor({ first_name: "a1", age: 30 });
  const em = newEntityManager();
  const [a] = aliases(Author);
  const rows = await em.query({ select: { name: a.firstName, age: a.age }, from: a });
  expect(rows).toMatchObject([{ name: "a1", age: 30 }]);
});

// 3. Inner join via FK
it("can join via FK reference", async () => {
  await insertAuthor({ first_name: "a1" });
  await insertBook({ title: "b1", author_id: 1 });
  const em = newEntityManager();
  const [a, b] = aliases(Author, Book);
  const rows = await em.query({
    select: { author: a.firstName, title: b.title },
    from: a,
    join: [a.on(b.author)],
  });
  expect(rows).toMatchObject([{ author: "a1", title: "b1" }]);
});

// 4. Left join
it("can left join", async () => {
  await insertAuthor({ first_name: "a1" });
  await insertAuthor({ first_name: "a2" });
  await insertBook({ title: "b1", author_id: 1 });
  const em = newEntityManager();
  const [a, b] = aliases(Author, Book);
  const rows = await em.query({
    select: { author: a.firstName, title: b.title },
    from: a,
    join: [a.leftOn(b.author)],
    orderBy: [asc(a.firstName)],
  });
  expect(rows).toMatchObject([{ author: "a1", title: "b1" }, { author: "a2", title: null }]);
});

// 5. GROUP BY + count aggregate
it("can group by with count", async () => {
  await insertAuthor({ first_name: "a1" });
  await insertBook({ title: "b1", author_id: 1 });
  await insertBook({ title: "b2", author_id: 1 });
  const em = newEntityManager();
  const [a, b] = aliases(Author, Book);
  const rows = await em.query({
    select: { name: a.firstName, bookCount: count() },
    from: a,
    join: [a.on(b.author)],
    groupBy: [a.firstName],
  });
  expect(rows).toMatchObject([{ name: "a1", bookCount: 2 }]);
});

// 6. Multiple aggregates (sum, avg, min, max)
it("can select multiple aggregates", async () => {
  await insertAuthor({ first_name: "a1", age: 20 });
  await insertAuthor({ first_name: "a2", age: 40 });
  const em = newEntityManager();
  const [a] = aliases(Author);
  const [row] = await em.query({
    select: { total: count(), avgAge: avg(a.age), minAge: min(a.age), maxAge: max(a.age) },
    from: a,
  });
  expect(row).toMatchObject({ total: 2, avgAge: 30, minAge: 20, maxAge: 40 });
});

// 7. HAVING
it("can filter groups with having", async () => {
  await insertAuthor({ first_name: "a1" });
  await insertAuthor({ first_name: "a2" });
  await insertBook({ title: "b1", author_id: 1 });
  await insertBook({ title: "b2", author_id: 1 });
  await insertBook({ title: "b3", author_id: 2 });
  const em = newEntityManager();
  const [a, b] = aliases(Author, Book);
  const rows = await em.query({
    select: { name: a.firstName, bookCount: count() },
    from: a,
    join: [a.on(b.author)],
    groupBy: [a.firstName],
    having: { and: [count().gt(1)] },
  });
  expect(rows).toMatchObject([{ name: "a1", bookCount: 2 }]);
});

// 8. Condition pruning — undefined values skipped
it("prunes undefined conditions", async () => {
  await insertAuthor({ first_name: "a1" });
  await insertAuthor({ first_name: "a2" });
  const em = newEntityManager();
  const [a] = aliases(Author);
  const nameFilter: string | undefined = undefined;
  const rows = await em.query({
    select: { name: a.firstName },
    from: a,
    where: { and: [a.firstName.eq(nameFilter)] },
    orderBy: [asc(a.firstName)],
  });
  expect(rows).toMatchObject([{ name: "a1" }, { name: "a2" }]);
});

// 9. orderBy with asc/desc
it("can order by asc and desc", async () => {
  await insertAuthor({ first_name: "a1" });
  await insertAuthor({ first_name: "a2" });
  const em = newEntityManager();
  const [a] = aliases(Author);
  const rows = await em.query({
    select: { name: a.firstName },
    from: a,
    orderBy: [desc(a.firstName)],
  });
  expect(rows).toMatchObject([{ name: "a2" }, { name: "a1" }]);
});

// 10. limit and offset
it("can limit and offset", async () => {
  await insertAuthor({ first_name: "a1" });
  await insertAuthor({ first_name: "a2" });
  await insertAuthor({ first_name: "a3" });
  const em = newEntityManager();
  const [a] = aliases(Author);
  const rows = await em.query({
    select: { name: a.firstName },
    from: a,
    orderBy: [asc(a.firstName)],
    limit: 2,
    offset: 1,
  });
  expect(rows).toMatchObject([{ name: "a2" }, { name: "a3" }]);
});
```

**Gap-specific tests:**

```ts
// 11. rawCondition — standalone raw SQL in WHERE (gap #1)
it("can use rawCondition for unmodeled columns", async () => {
  await insertAuthor({ first_name: "a1", age: 30 });
  await insertAuthor({ first_name: "a2", age: 40 });
  const em = newEntityManager();
  const [a] = aliases(Author);
  const rows = await em.query({
    select: { name: a.firstName },
    from: a,
    where: { and: [rawCondition("a.age > ?", [35], [a])] },
  });
  expect(rows).toMatchObject([{ name: "a2" }]);
});

// 12. Non-FK join condition (gap #2)
// Author self-join: find authors whose mentor has age > their own age
it("can join with arbitrary condition", async () => {
  await insertAuthor({ first_name: "mentor", age: 50 });
  await insertAuthor({ first_name: "mentee", age: 25, mentor_id: 1 });
  const em = newEntityManager();
  const [a, m] = [alias(Author), alias(Author)];
  const rows = await em.query({
    select: { mentee: a.firstName, mentor: m.firstName },
    from: a,
    join: [a.on(m.mentor.eq(a))],  // non-FK arbitrary condition form
    where: { and: [m.age.gt(a.age)] },
  });
  expect(rows).toMatchObject([{ mentee: "mentor", mentor: "mentee" }]);
  // Actually: mentee's mentor_id = mentor's id, and mentor.age > mentee.age
});

// 13. Entity mode + GROUP BY + aggregate ORDER BY (gap #3)
it("can return entities ordered by aggregate", async () => {
  await insertAuthor({ first_name: "a1" });
  await insertAuthor({ first_name: "a2" });
  await insertBook({ title: "b1", author_id: 1 });
  await insertBook({ title: "b2", author_id: 2 });
  await insertBook({ title: "b3", author_id: 2 });
  const em = newEntityManager();
  const [a, b] = aliases(Author, Book);
  const authors = await em.query({
    select: a,
    from: a,
    join: [a.on(b.author)],
    groupBy: [a.id],
    orderBy: [desc(count())],
  });
  // a2 has 2 books, a1 has 1
  expect(authors).toMatchEntity([{ firstName: "a2" }, { firstName: "a1" }]);
});

// 14. rawExpr in orderBy (gap #4)
it("can order by rawExpr", async () => {
  await insertAuthor({ first_name: "a1", age: 10 });
  await insertAuthor({ first_name: "a2", age: 20 });
  const em = newEntityManager();
  const [a] = aliases(Author);
  const rows = await em.query({
    select: { name: a.firstName },
    from: a,
    orderBy: [desc(rawExpr<number>("a.age * 2"))],
  });
  expect(rows).toMatchObject([{ name: "a2" }, { name: "a1" }]);
});

// 15. nin() on aliases (gap #5)
it("can use nin on alias", async () => {
  await insertAuthor({ first_name: "a1" });
  await insertAuthor({ first_name: "a2" });
  await insertAuthor({ first_name: "a3" });
  const em = newEntityManager();
  const [a] = aliases(Author);
  const rows = await em.query({
    select: { name: a.firstName },
    from: a,
    where: { and: [a.firstName.nin(["a1", "a3"])] },
  });
  expect(rows).toMatchObject([{ name: "a2" }]);
});

// 16. distinct
it("can select distinct", async () => {
  await insertAuthor({ first_name: "a1" });
  await insertBook({ title: "b1", author_id: 1 });
  await insertBook({ title: "b2", author_id: 1 });
  const em = newEntityManager();
  const [a, b] = aliases(Author, Book);
  const rows = await em.query({
    select: { name: a.firstName },
    from: a,
    join: [a.on(b.author)],
    distinct: true,
  });
  expect(rows).toMatchObject([{ name: "a1" }]);
});

// 17. arrayAgg aggregate
it("can use arrayAgg", async () => {
  await insertAuthor({ first_name: "a1" });
  await insertBook({ title: "b1", author_id: 1 });
  await insertBook({ title: "b2", author_id: 1 });
  const em = newEntityManager();
  const [a, b] = aliases(Author, Book);
  const rows = await em.query({
    select: { name: a.firstName, titles: arrayAgg(b.title) },
    from: a,
    join: [a.on(b.author)],
    groupBy: [a.firstName],
  });
  expect(rows).toMatchObject([{ name: "a1", titles: ["b1", "b2"] }]);
});

// 18. subquery in WHERE
it("can use subquery in where", async () => {
  await insertAuthor({ first_name: "a1" });
  await insertAuthor({ first_name: "a2" });
  await insertBook({ title: "b1", author_id: 1 });
  const em = newEntityManager();
  const [a, b] = aliases(Author, Book);
  const sq = subquery({ select: b.author, from: b });
  const authors = await em.query({
    select: a,
    from: a,
    where: { and: [a.id.in(sq)] },
  });
  expect(authors).toMatchEntity([{ firstName: "a1" }]);
});
```

### Remaining Open Questions

1. **`Expr<R>` reusability** — we'll try making `Expr` a stable reference that can appear in
   select, having, and orderBy. If this gets hairy, we can fall back to regenerating the SQL
   fragment at each usage site.
