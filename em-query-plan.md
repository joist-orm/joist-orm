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

### Aliases (reuse and extend existing)

```ts
const [a, b] = aliases(Author, Book);
```

Aliases already carry per-field type info via `Alias<T>` → `PrimitiveAlias<V, N>` / `EntityAlias<T>`.
We reuse them as both column references (in select/groupBy/orderBy) and condition builders
(in where/having), exactly like `em.find` does today.

However, for `em.query`, aliases need to also participate in a shared expression protocol.
Today alias fields can produce conditions, but `em.query` also needs to render them in
`select`, `groupBy`, `orderBy`, raw SQL interpolation, CTE output columns, and result
mapping. So alias fields, aggregate expressions, CTE columns, and SQL-template expressions
should all implement the same internal `QueryExpr<R>`/`Selectable<R>` shape.

This is also where we should fix a current type gap: `EntityAlias<T>` should carry
field nullability, just like `PrimitiveAlias<V, N>` does. Selecting `a.id` or `b.author`
should return the tagged id type (`AuthorId`), with `null` only if the FK is nullable.

Graph-walking joins should be modeled as relation aliases, not methods on the entity alias
itself. M2O fields like `b.author` can be both a selectable FK expression and a joinable
relation path. O2M/M2M fields like `a.books`, which `Alias<T>` does not expose today,
should become join-only relation paths. This gives us terse joins that name the actual graph
edge: `a.books.on(b)` and `b.author.on(a)`.

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

Type extraction from selectables:

```ts
declare const queryExpr: unique symbol;

interface QueryExpr<R> {
  readonly [queryExpr]: {
    /** Referenced aliases, used for join pruning and raw SQL interpolation safety. */
    aliases: Alias<any>[];
    /** Converts result-set values back into Joist domain values. */
    decode(value: unknown): R;
  };

  eq(value: R | QueryExpr<R> | undefined): ExpressionCondition;
  ne(value: R | QueryExpr<R> | undefined): ExpressionCondition;
  gt(value: R | QueryExpr<R> | undefined): ExpressionCondition;
  gte(value: R | QueryExpr<R> | undefined): ExpressionCondition;
  lt(value: R | QueryExpr<R> | undefined): ExpressionCondition;
  lte(value: R | QueryExpr<R> | undefined): ExpressionCondition;
}

type PrimitiveAlias<V, N extends null | never> = QueryExpr<V | N> & PrimitiveAliasConditions<V, N>;
type EntityAlias<T, N extends null | never = never> = QueryExpr<IdOf<T> | N> & EntityAliasConditions<T, N>;
type Expr<R> = QueryExpr<R>;

// Extract the value type from a selectable expression.
type SelectableType<S> = S extends QueryExpr<infer R> ? R : S extends Alias<infer T> ? T : never;

// Infer the full result row from a select object
type QueryResult<S> =
  S extends Alias<infer T> ? T :                          // entity mode
  { [K in keyof S]: SelectableType<S[K]> };               // POJO mode
```

TS can infer `R` from the shared expression protocol. Alias field expressions use metadata
to attach the correct result decoder, so selecting `a.id` returns `AuthorId`, selecting an
enum returns the enum value, selecting a custom serde returns its domain value, and Temporal
fields honor the application's Temporal configuration.

### Full API Shape

```ts
em.query<S>(query: {
  select: S;
  from: Alias<any> | CteAlias<any>;
  join?: (JoinClause | undefined)[];
  with?: CteAlias<any>[];
  where?: ExpressionFilter;    // reuse existing type
  groupBy?: Groupable[];
  having?: ExpressionFilter;
  orderBy?: (Orderable | undefined)[];
  limit?: number;
  offset?: number;
  distinct?: boolean;
}): Promise<QueryResult<S>[]>
```

`undefined` joins/orderBys/conditions are pruned. Joins are also dependency-pruned like
`em.find`: if a join is only needed by a condition/order/select that itself gets pruned,
the join disappears too. This is intentional and part of the core DX of the API.

The pruning dependency graph keeps aliases referenced by `select`, `where`, `groupBy`,
`having`, `orderBy`, and the ON clauses of kept joins. Alias-aware `sql` expressions must
participate in this by reporting every alias they interpolate. Last-resort unsafe SQL must
therefore require an explicit alias list; otherwise Joist cannot safely prune around it.

### Example Queries

**1. Entity mode — complex WHERE returning entities**

```ts
const [a, b] = aliases(Author, Book);
const authors = await em.query({
  select: a,
  from: a,
  join: [a.books.on(b)],
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
  join: [a.books.leftOn(b)],
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
  join: [a.books.on(b)],
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

Joins support two shapes: an abbreviated graph-walking form for boring FK joins, and an
expanded form for arbitrary SQL join conditions.

```ts
// Abbreviated FK joins: the receiver is the relation path.
a.books.on(b)        // JOIN books b ON b.author_id = a.id
a.books.leftOn(b)    // LEFT JOIN books b ON b.author_id = a.id
b.author.on(a)       // JOIN authors a ON b.author_id = a.id
b.author.leftOn(a)   // LEFT JOIN authors a ON b.author_id = a.id

// Expanded form: join an alias with an arbitrary ON condition.
innerJoin(b, b.author.eq(a))
leftJoin(b, b.author.eq(a))
```

The abbreviated form keeps "just walking the graph" joins compact while still naming both
sides of the relationship. The relation path supplies the FK metadata and one alias; the
`.on(...)` argument supplies the other alias. Parsing looks at the aliases already present
in `from`/previous joins and joins the side that is not yet in scope. If both sides are
already in scope or neither side is in scope, parsing fails with a clear ambiguity error.
There is no ambient lookup for "the other side".

Both directions should work for normal FK-backed relations:

```ts
// Starting from Author, join Books.
join: [a.books.on(b)]

// Starting from Book, join Author.
join: [b.author.on(a)]
```

For self-joins:

```ts
const [a1, a2] = [alias(Author), alias(Author)];

await em.query({
  select: { author: a1.firstName, mentor: a2.firstName },
  from: a1,
  join: [a1.mentor.on(a2)],
});
```

The expanded form is the escape hatch for non-FK joins, multiple-column joins, and any join
whose target should not be inferred from metadata:

```ts
const [a1, a2] = [alias(Author), alias(Author)];

await em.query({
  select: { mentee: a1.firstName, mentor: a2.firstName },
  from: a1,
  join: [innerJoin(a2, a1.mentor.eq(a2))],
});
```

This requires adding relation alias objects, plus free-standing helpers for expanded joins:

```ts
type ReferenceAlias<T extends Entity, N extends null | never = never> = EntityAlias<T, N> & RelationAlias<T>;

interface CollectionAlias<T extends Entity> extends RelationAlias<T> {}

interface RelationAlias<T extends Entity> {
  on(alias: Alias<T>): JoinClause;
  leftOn(alias: Alias<T>): JoinClause;
}

function innerJoin<T extends Entity>(alias: Alias<T>, on: ExpressionCondition | undefined): JoinClause | undefined;
function leftJoin<T extends Entity>(alias: Alias<T>, on: ExpressionCondition | undefined): JoinClause | undefined;
```

`Alias<T>` should map M2O relation fields to `ReferenceAlias<U, N>` and O2M/M2M relation
fields to `CollectionAlias<U>`. `ReferenceAlias` remains selectable as the FK id; collection
aliases are not selectable and only exist for graph walking joins.

We still need to extend `EntityAlias.eq()` and the other comparison methods to accept
compatible aliases / alias-field expressions, mirroring what `PrimitiveAlias.eq()` already
supports for cross-column primitive comparisons. If the expanded ON condition is `undefined`
or `skipCondition`, the whole expanded join is pruned.

### Aggregate & Expression Types

```ts
// Each returns Expr<R> which carries SQL generation, aliases, bindings, and result decoding.
function count(): Expr<number>; // emits count(*)::int so the runtime result matches the TS type
function count(col: QueryExpr<any>): Expr<number>; // emits count(col)::int
function countDistinct(col: QueryExpr<any>): Expr<number>;
function countBig(): Expr<bigint>; // emits count(*)::bigint and decodes to bigint
function sum(col: QueryExpr<number>): Expr<number | null>;
function sum(col: QueryExpr<bigint>): Expr<bigint | null>;
function avg(col: QueryExpr<number>): Expr<number | null>;
function min<V>(col: QueryExpr<V>): Expr<V | null>;
function max<V>(col: QueryExpr<V>): Expr<V | null>;
function arrayAgg<V>(col: QueryExpr<V>): Expr<V[]>;
function stringAgg(col: QueryExpr<string>, delimiter: string): Expr<string | null>;
function coalesce<V>(col: QueryExpr<V | null>, fallback: V): Expr<V>;

// Expr<R> also has condition methods for use in HAVING
interface Expr<R> {
  eq(value: R | QueryExpr<R> | undefined): ExpressionCondition;
  ne(value: R | QueryExpr<R> | undefined): ExpressionCondition;
  gt(value: R | QueryExpr<R> | undefined): ExpressionCondition;
  gte(value: R | QueryExpr<R> | undefined): ExpressionCondition;
  lt(value: R | QueryExpr<R> | undefined): ExpressionCondition;
  lte(value: R | QueryExpr<R> | undefined): ExpressionCondition;
}

// Alias-aware SQL escape hatches. QueryExpr interpolations render SQL; other values become bindings.
function sql<R>(strings: TemplateStringsArray, ...values: SqlInterpolation[]): Expr<R>;
sql.condition(strings: TemplateStringsArray, ...values: SqlInterpolation[]): ExpressionCondition;
sql.ref<R>(alias: Alias<any> | CteAlias<any>, column: string): Expr<R>;

// Last-resort escape hatch for SQL that cannot be represented with sql``.
function unsafeRawExpr<R>(sql: string, bindings: readonly any[], aliases: Alias<any>[]): Expr<R>;

// Order helpers
function asc(col: QueryExpr<any>): Orderable;
function desc(col: QueryExpr<any>): Orderable;
```

The `sql` template is important: users should not write `"a.age * 2"` and hope `a` is the
SQL alias Joist assigned. Interpolating `${a.age}` lets Joist render the correct alias,
quote keywords, collect referenced aliases for pruning, and bind literal values safely.

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
  aliases: string[];
  decode(value: unknown): unknown;
}

interface ParsedRawJoin {
  type: "inner" | "left";
  alias: string;
  table: string;
  on: string;           // e.g. `b."author_id" = a."id"`
  bindings: any[];
  aliases: string[];    // aliases referenced by the ON clause
}

interface ParsedRawOrderBy {
  sql: string;          // e.g. `a."first_name"`, `count(*)`
  direction: "ASC" | "DESC";
  bindings: any[];
  aliases: string[];
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
- serde/column metadata — result decoding for selected alias fields and CTE columns

**What is new:**
1. **`parseRawQuery()`** — converts the query object literal into `ParsedRawQuery`.
   Walks the select/join/where/groupBy/having/orderBy, resolving alias columns via
   metadata, calling `setAlias()` on each alias.

2. **`buildRawQuerySql()`** — new SQL generator for `ParsedRawQuery`. Simpler than
   `buildRawQuery` since it doesn't handle DISTINCT ON, lateral joins, etc. Generates:
   `[WITH ...] SELECT ... FROM ... [JOIN ...] [WHERE ...] [GROUP BY ...] [HAVING ...] [ORDER BY ...] [LIMIT ...] [OFFSET ...]`

3. **`QueryExpr<R>` runtime protocol** — carries SQL generation info, referenced aliases,
   bindings, and result decoding. Alias fields, aggregates, CTE fields, SQL-template
   expressions, and subqueries all implement this protocol.

4. **`RelationAlias.on()` / `RelationAlias.leftOn()` abbreviated joins** — graph-walking
   joins like `a.books.on(b)` and `b.author.on(a)` that explicitly name both sides of the
   relationship and participate in dependency pruning.

5. **`innerJoin()` / `leftJoin()` expanded joins** — free-standing helpers for arbitrary
   ON clauses, non-FK joins, and multi-column joins.

6. **Alias-aware `sql` template helpers** — render QueryExpr interpolations, bind literal
   values, and track aliases so raw-ish SQL is still safe under alias reassignment and join
   pruning.

7. **Result mapping** — entity mode: run rows through `em.hydrate()`, look up in identity
   map for the return value (but no clause evaluation against in-memory state). POJO mode:
   map columns back to select keys and run each select expression's decoder before returning
   plain objects.

8. **Output decoders** — selecting alias fields should return domain values, not raw DB
   values. This may require adding a small public/internal `mapFromDb`-style adapter around
   existing serde metadata instead of relying only on `setOnEntity()`.

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

**1. Alias-aware SQL conditions** (sample-1, sample-approvals)
Full-text search (`ts_search @@ plainto_tsquery(?)`) and dynamic poly component NOT NULL
checks need SQL conditions not tied to a modeled alias field. Use `sql.condition` plus
`sql.ref` for unmodeled columns:
```ts
sql.condition`${sql.ref<string>(a, "ts_search")} @@ plainto_tsquery(${term})`
sql.condition`${sql.ref(a, componentColumn)} IS NOT NULL`
```
This is similar to the existing `RawCondition` type, but user-facing and alias-aware, so
Joist can still quote identifiers, bind values, and track aliases for pruning.

**2. Non-FK join conditions** (sample-bid-contract-items)
`bcli.item_template_item_id = iti.bid_item_template_item_id` is not a standard FK→PK join.
The expanded join form accepts an `ExpressionCondition` for arbitrary ON clauses:
```ts
// FK-based (common case)
a.books.on(b)
// Arbitrary condition
leftJoin(bcli, bcli.itemTemplateItem.eq(iti.bidItemTemplateItem))
```
This also requires extending `EntityAlias.eq()` to accept another `EntityAlias` for
cross-column FK comparisons.

**3. Entity mode + GROUP BY + aggregate ORDER BY** (sample-bills)
Entity mode (`select: b`) with `groupBy: [b.id]` and `orderBy: [desc(sum(bli.amountInCents))]`.
PG allows this since the PK functionally determines all columns. This is a valid combo that
the API already supports — no changes needed, just confirming it works.

**4. Alias-aware `sql<R>` expressions in orderBy** (sample-bills)
Compound expressions like `SUM(bli.amount_in_cents) - b.quickbooks_amount_paid_in_cents`
can't be built from primitive aggregate helpers. `sql<R>``...`` needs to work in `orderBy`,
not just `select`:
```ts
desc(sql<number>`${sum(bli.amountInCents)} - ${b.quickbooksAmountPaidInCents}`)
```

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

// 2b. POJO mode — selected ids and serdes are decoded to domain values
it("decodes selected fields", async () => {
  await insertAuthor({ first_name: "a1", age: 30 });
  const em = newEntityManager();
  const [a] = aliases(Author);
  const rows = await em.query({ select: { authorId: a.id, age: a.age }, from: a });
  expect(rows).toMatchObject([{ authorId: "a:1", age: 30 }]);
});

// 3. Inner join via collection relation
it("can join via collection relation", async () => {
  await insertAuthor({ first_name: "a1" });
  await insertBook({ title: "b1", author_id: 1 });
  const em = newEntityManager();
  const [a, b] = aliases(Author, Book);
  const rows = await em.query({
    select: { author: a.firstName, title: b.title },
    from: a,
    join: [a.books.on(b)],
  });
  expect(rows).toMatchObject([{ author: "a1", title: "b1" }]);
});

// 3b. Inner join via reference relation
it("can join via reference relation", async () => {
  await insertAuthor({ first_name: "a1" });
  await insertBook({ title: "b1", author_id: 1 });
  const em = newEntityManager();
  const [a, b] = aliases(Author, Book);
  const rows = await em.query({
    select: { author: a.firstName, title: b.title },
    from: b,
    join: [b.author.on(a)],
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
    join: [a.books.leftOn(b)],
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
    join: [a.books.on(b)],
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
    join: [a.books.on(b)],
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

// 8b. Join pruning — joins used only by pruned clauses are skipped
it("prunes unused joins", async () => {
  await insertAuthor({ first_name: "a1" });
  await insertAuthor({ first_name: "a2" });
  const em = newEntityManager();
  const [a, b] = aliases(Author, Book);
  const titleFilter: string | undefined = undefined;
  const rows = await em.query({
    select: { name: a.firstName },
    from: a,
    join: [a.books.on(b)],
    where: { and: [b.title.eq(titleFilter)] },
    orderBy: [asc(a.firstName)],
  });
  expect(rows).toMatchObject([{ name: "a1" }, { name: "a2" }]);
  // Also assert the generated SQL has no JOIN when we add SQL-capture helpers for em.query.
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
// 11. sql.condition — standalone SQL in WHERE (gap #1)
it("can use sql.condition for unmodeled columns", async () => {
  await insertAuthor({ first_name: "a1", age: 30 });
  await insertAuthor({ first_name: "a2", age: 40 });
  const em = newEntityManager();
  const [a] = aliases(Author);
  const rows = await em.query({
    select: { name: a.firstName },
    from: a,
    where: { and: [sql.condition`${sql.ref<number>(a, "age")} > ${35}`] },
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
    join: [innerJoin(m, a.mentor.eq(m))],
    where: { and: [m.age.gt(a.age)] },
  });
  expect(rows).toMatchObject([{ mentee: "mentee", mentor: "mentor" }]);
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
    join: [a.books.on(b)],
    groupBy: [a.id],
    orderBy: [desc(count())],
  });
  // a2 has 2 books, a1 has 1
  expect(authors).toMatchEntity([{ firstName: "a2" }, { firstName: "a1" }]);
});

// 14. sql expression in orderBy (gap #4)
it("can order by sql expression", async () => {
  await insertAuthor({ first_name: "a1", age: 10 });
  await insertAuthor({ first_name: "a2", age: 20 });
  const em = newEntityManager();
  const [a] = aliases(Author);
  const rows = await em.query({
    select: { name: a.firstName },
    from: a,
    orderBy: [desc(sql<number>`${a.age} * 2`)],
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
    join: [a.books.on(b)],
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
    join: [a.books.on(b)],
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

1. **`QueryExpr<R>` reusability** — we'll try making `QueryExpr` a stable reference that can
   appear in select, having, and orderBy. If this gets hairy, we can fall back to regenerating
   the SQL fragment at each usage site.
2. **Result decoder API** — alias field expressions need a direct DB-value-to-domain-value
   adapter. We should first look for the smallest wrapper around existing serde metadata before
   adding a new serde interface.
