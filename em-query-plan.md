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

### Remaining Open Questions

1. **Alias binding** — keep deferred binding for consistency with existing alias system.

2. **`Expr<R>` reusability** — we'll try making `Expr` a stable reference that can appear in
   select, having, and orderBy. If this gets hairy, we can fall back to regenerating the SQL
   fragment at each usage site.
