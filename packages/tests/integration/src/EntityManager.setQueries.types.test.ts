import { expectTypeOf } from "expect-type";
import {
  type EntityQuery,
  type Expr,
  type Query,
  type ScalarQuery,
  type SetQuery,
  type Subquery,
  query,
  sql,
  tables,
} from "joist-orm";
import { Author, type AuthorId, Book, type BookId, Comment } from "src/entities";
import { newEntityManager } from "src/testEm";

describe("EntityManager.setQueries.types", () => {
  it("type-checks without executing queries", () => {
    // Given compile-time assertions that include deliberately invalid read queries
    // When referencing the assertion function instead of calling it
    // Then Jest can load this suite without executing those queries
    expect(typeof typeAssertions).toBe("function");
  });
});

/**
 * Checks compound read inference and rejected inputs through the public query APIs.
 *
 * This function is never called. `tsc` checks the exact result types and each `@ts-expect-error`;
 * the Jest test only references the function, so no database setup or execution is needed.
 */
function typeAssertions() {
  // Given an EntityManager whose query results are checked without executing them
  const em = newEntityManager();
  // And Author, Book, and Comment aliases with distinct field and id domains
  const [a, b, c] = tables(Author, Book, Comment);
  // And required Author names and Book titles projected under the same output key
  const authorNames = { from: a, select: { name: a.first_name } } satisfies Query;
  // And a compatible Book branch with a different source column name
  const bookNames = { from: b, select: { name: b.title } } satisfies Query;
  // And nullable Author last names with the same output key
  const lastNames = { from: a, select: { name: a.last_name } } satisfies Query;

  // When applying each operation to two known compatible operands
  // Then all six operations infer the selected POJO, not an entity or an unknown row
  expectTypeOf(em.query({ union: [authorNames, bookNames] })).resolves.toEqualTypeOf<{ name: string }[]>();
  expectTypeOf(em.query({ unionAll: [authorNames, bookNames] })).resolves.toEqualTypeOf<{ name: string }[]>();
  expectTypeOf(em.query({ intersect: [authorNames, bookNames] })).resolves.toEqualTypeOf<{ name: string }[]>();
  expectTypeOf(em.query({ intersectAll: [authorNames, bookNames] })).resolves.toEqualTypeOf<{ name: string }[]>();
  expectTypeOf(em.query({ except: [authorNames, bookNames] })).resolves.toEqualTypeOf<{ name: string }[]>();
  expectTypeOf(em.query({ exceptAll: [authorNames, bookNames] })).resolves.toEqualTypeOf<{ name: string }[]>();

  // Given a readonly tuple with three compatible name branches
  const readonlyNames = [authorNames, bookNames, authorNames] as const;
  // And a mutable tuple whose minimum length is known statically
  const tupleNames: [typeof authorNames, typeof bookNames] = [authorNames, bookNames];
  // And a dynamically sized array retaining the Author and Book projection types
  const dynamicNames = [authorNames, bookNames];
  // And a readonly view of that dynamic array, which still needs runtime arity validation
  const readonlyDynamicNames: readonly (typeof authorNames | typeof bookNames)[] = dynamicNames;
  // When accepting tuples and arrays without widening their rows
  // Then readonly operands and dynamic lengths do not change the result shape
  expectTypeOf(em.query({ union: readonlyNames })).resolves.toEqualTypeOf<{ name: string }[]>();
  expectTypeOf(query({ exceptAll: readonlyNames })).toEqualTypeOf<Subquery<{ name: string }, "?">>();
  expectTypeOf(em.query({ intersectAll: tupleNames })).resolves.toEqualTypeOf<{ name: string }[]>();
  expectTypeOf(query({ unionAll: dynamicNames })).toEqualTypeOf<Subquery<{ name: string }, "?">>();
  expectTypeOf(em.query({ union: readonlyDynamicNames })).resolves.toEqualTypeOf<{ name: string }[]>();
  expectTypeOf(query({ intersect: readonlyDynamicNames })).toEqualTypeOf<Subquery<{ name: string }, "?">>();

  // When a nullable last name occurs first, in the middle, or last
  // Then both UNION variants combine column nullability from every branch
  expectTypeOf(em.query({ union: [lastNames, authorNames, bookNames] })).resolves.toEqualTypeOf<
    { name: string | null }[]
  >();
  expectTypeOf(em.query({ union: [authorNames, lastNames, bookNames] })).resolves.toEqualTypeOf<
    { name: string | null }[]
  >();
  expectTypeOf(em.query({ union: [authorNames, bookNames, lastNames] })).resolves.toEqualTypeOf<
    { name: string | null }[]
  >();
  expectTypeOf(em.query({ unionAll: [lastNames, authorNames, bookNames] })).resolves.toEqualTypeOf<
    { name: string | null }[]
  >();
  expectTypeOf(em.query({ unionAll: [authorNames, lastNames, bookNames] })).resolves.toEqualTypeOf<
    { name: string | null }[]
  >();
  expectTypeOf(em.query({ unionAll: [authorNames, bookNames, lastNames] })).resolves.toEqualTypeOf<
    { name: string | null }[]
  >();

  // Given a required Book title made nullable only by its branch's LEFT join
  const leftBookNames = {
    from: a,
    join: [{ left: b, on: b.author_id.eq(a.id) }],
    select: { name: b.title },
  } satisfies Query;
  // And a reusable query value that must retain that branch's actual nullable row
  const leftBookNamesValue = query(leftBookNames);
  // When the LEFT-joined branch occupies each possible position in a three-way union
  // Then inference uses QueryRow, not just the nonnullable type of Book.title
  expectTypeOf(em.query({ union: [leftBookNames, authorNames, bookNames] })).resolves.toEqualTypeOf<
    { name: string | null }[]
  >();
  expectTypeOf(em.query({ union: [authorNames, leftBookNames, bookNames] })).resolves.toEqualTypeOf<
    { name: string | null }[]
  >();
  expectTypeOf(em.query({ union: [authorNames, bookNames, leftBookNames] })).resolves.toEqualTypeOf<
    { name: string | null }[]
  >();
  expectTypeOf(em.query({ unionAll: [leftBookNamesValue, authorNames, bookNames] })).resolves.toEqualTypeOf<
    { name: string | null }[]
  >();
  expectTypeOf(em.query({ unionAll: [authorNames, leftBookNamesValue, bookNames] })).resolves.toEqualTypeOf<
    { name: string | null }[]
  >();
  expectTypeOf(em.query({ unionAll: [authorNames, bookNames, leftBookNamesValue] })).resolves.toEqualTypeOf<
    { name: string | null }[]
  >();
  expectTypeOf(
    em.query({
      union: [
        {
          from: a,
          groupBy: [a.first_name],
          select: { name: a.first_name, title: a.first_name, count: a.id.count() },
        },
        {
          from: a,
          join: [{ left: b, on: b.author_id.eq(a.id) }],
          groupBy: [a.first_name, b.title],
          select: { name: a.first_name, title: b.title, count: b.id.count() },
        },
      ],
    }),
  ).resolves.toEqualTypeOf<{ name: string; title: string | null; count: number }[]>();

  // When a nullable right branch is intersected or subtracted from required Author names
  // Then neither operation widens the left row, including its ALL variant
  expectTypeOf(em.query({ except: [authorNames, leftBookNames] })).resolves.toEqualTypeOf<{ name: string }[]>();
  expectTypeOf(em.query({ exceptAll: [authorNames, lastNames] })).resolves.toEqualTypeOf<{ name: string }[]>();
  expectTypeOf(em.query({ intersect: [authorNames, leftBookNamesValue] })).resolves.toEqualTypeOf<{ name: string }[]>();
  expectTypeOf(em.query({ intersectAll: [authorNames, lastNames] })).resolves.toEqualTypeOf<{ name: string }[]>();
  // When the left branch itself is nullable
  // Then EXCEPT and INTERSECT conservatively retain NULL instead of promising narrowing
  expectTypeOf(em.query({ except: [leftBookNames, authorNames] })).resolves.toEqualTypeOf<{ name: string | null }[]>();
  expectTypeOf(em.query({ exceptAll: [lastNames, authorNames] })).resolves.toEqualTypeOf<{ name: string | null }[]>();
  expectTypeOf(em.query({ intersect: [leftBookNamesValue, authorNames] })).resolves.toEqualTypeOf<
    { name: string | null }[]
  >();
  expectTypeOf(em.query({ intersectAll: [lastNames, authorNames] })).resolves.toEqualTypeOf<
    { name: string | null }[]
  >();

  // Given a required scalar Book order query and a nullable scalar Author age query
  const orders = query({ from: b, select: b.order });
  // And nullable ages with the same numeric result domain
  const ages = query({ from: a, select: a.age });
  // And Book orders made nullable by a LEFT join rather than by their field definition
  const leftOrders = {
    from: a,
    join: [{ left: b, on: b.author_id.eq(a.id) }],
    select: b.order,
  } satisfies Query;
  // When constructing ordinary scalar subqueries and executing scalar SELECT inputs
  // Then expression use adds SQL NULL, while execution retains each selected row's nullability
  expectTypeOf(orders).toEqualTypeOf<ScalarQuery<number>>();
  expectTypeOf(ages).toEqualTypeOf<ScalarQuery<number | null>>();
  expectTypeOf(query(leftOrders)).toEqualTypeOf<ScalarQuery<number | null>>();
  expectTypeOf(orders.coalesce(0)).toEqualTypeOf<Expr<number, never>>();
  expectTypeOf(em.query({ from: a, select: { order: orders, fallback: orders.coalesce(0) } })).resolves.toEqualTypeOf<
    { order: number | null; fallback: number }[]
  >();
  expectTypeOf(em.query({ from: b, select: b.order })).resolves.toEqualTypeOf<number[]>();
  expectTypeOf(em.query({ from: a, select: a.age })).resolves.toEqualTypeOf<(number | null)[]>();
  expectTypeOf(em.query({ from: a, join: leftOrders.join, select: b.order })).resolves.toEqualTypeOf<
    (number | null)[]
  >();

  // Given a compound POJO checked with satisfies rather than widened to SetQuery
  const namesInput = { union: [authorNames, bookNames], orderBy: { name: "ASC" } } satisfies SetQuery;
  // And a named version retaining its literal alias
  const namedInput = { ...namesInput, as: "names" } as const satisfies SetQuery;
  // And an ordinary named query value that can also serve as a compound operand
  const namedBookNames = query({ ...bookNames, as: "book_names" });
  // When constructing anonymous and named compound values
  const names = query(namesInput);
  const namedNames = query(namedInput);
  // Then inferred output keys and alias identities survive satisfies SetQuery
  expectTypeOf(namesInput.union).toEqualTypeOf<[typeof authorNames, typeof bookNames]>();
  expectTypeOf(names).toEqualTypeOf<Subquery<{ name: string }, "?">>();
  expectTypeOf(namedNames).toEqualTypeOf<Subquery<{ name: string }, "names">>();
  expectTypeOf(namedNames.name).toEqualTypeOf<Expr<string, "names">>();
  expectTypeOf(query({ union: [authorNames, namedBookNames], as: "combined_names" })).toEqualTypeOf<
    Subquery<{ name: string }, "combined_names">
  >();
  expectTypeOf(em.query(namedNames)).resolves.toEqualTypeOf<{ name: string }[]>();
  expectTypeOf(
    em.query({
      from: namedNames,
      select: namedNames,
      where: namedNames.name.ne(""),
      orderBy: [{ asc: sql<string>`lower(${namedNames.name})` }],
    }),
  ).resolves.toEqualTypeOf<{ name: string }[]>();
  expectTypeOf(
    em.query({
      from: a,
      join: [{ left: namedNames, on: namedNames.name.eq(a.first_name) }],
      select: { author: a.first_name, name: namedNames.name, fallback: namedNames.name.coalesce("") },
    }),
  ).resolves.toEqualTypeOf<{ author: string; name: string | null; fallback: string }[]>();

  // Given nested mixed operators combining POJOs, ordinary query values, and named set values
  const nestedNames = {
    except: [
      { unionAll: [authorNames, namedBookNames, leftBookNamesValue] },
      { intersect: [namedNames, { except: [bookNames, query(authorNames)] }] },
    ],
  } satisfies SetQuery;
  // When constructing and directly executing the nested compound
  // Then its nullable left UNION row survives the outer EXCEPT
  expectTypeOf(query(nestedNames)).toEqualTypeOf<Subquery<{ name: string | null }, "?">>();
  expectTypeOf(em.query(nestedNames)).resolves.toEqualTypeOf<{ name: string | null }[]>();
  expectTypeOf(
    em.query({ union: [namedNames, { from: namedBookNames, select: namedBookNames }] }),
  ).resolves.toEqualTypeOf<{ name: string }[]>();

  // Given alternative compound roots with different named projections
  const nameOrOrderInput =
    Math.random() > 0.5
      ? ({ union: [authorNames, bookNames] } as const)
      : ({
          except: [
            { from: b, select: { order: b.order } },
            { from: b, select: { order: b.order } },
          ],
        } as const);
  // When the runtime choice determines which compound is constructed or executed
  // Then result inference distributes over the alternatives instead of losing their distinct keys
  expectTypeOf(query(nameOrOrderInput)).toEqualTypeOf<Subquery<{ name: string } | { order: number }, "?">>();
  expectTypeOf(em.query(nameOrOrderInput)).resolves.toEqualTypeOf<({ name: string } | { order: number })[]>();

  // Given matching name/detail key sets with opposite insertion order and different detail nullability
  const authorDetails = { from: a, select: { name: a.first_name, detail: a.last_name } } satisfies Query;
  // And a reusable Book projection whose first key is detail rather than name
  const bookDetails = query({ from: b, select: { detail: b.notes, name: b.title }, as: "book_details" });
  // When combining projections by their keys rather than their insertion order
  // Then the output preserves both names and combines nullability per column
  expectTypeOf(em.query({ union: [authorDetails, bookDetails] })).resolves.toEqualTypeOf<
    { name: string; detail: string | null }[]
  >();
  expectTypeOf(query({ unionAll: [bookDetails, authorDetails] })).toEqualTypeOf<
    Subquery<{ detail: string | null; name: string }, "?">
  >();
  expectTypeOf(
    query({
      union: [
        { from: a, select: { union: a.first_name } },
        { from: b, select: { union: b.title } },
      ],
      orderBy: { union: "ASC" },
      as: "keywords",
    }),
  ).toEqualTypeOf<Subquery<{ union: string }, "keywords">>();

  // Given Author PK and Book FK branches that both select Author ids
  const authorIds = { from: a, select: { id: a.id } } satisfies Query;
  // And the same id domain reached through Book.author, not Book.id
  const bookAuthorIds = { from: b, select: { id: b.author_id } } satisfies Query;
  // When combining PK and FK values in either operand order
  const ids = query({ union: [authorIds, bookAuthorIds], as: "author_ids" });
  // And selecting the compound's Author ids through an ordinary scalar subquery for membership checks
  const scalarIds = query({ from: ids, select: ids.id });
  // Then results and subsequent expression inputs retain the Author-id domain
  expectTypeOf(ids).toEqualTypeOf<Subquery<{ id: AuthorId }, "author_ids">>();
  expectTypeOf(em.query({ unionAll: [bookAuthorIds, authorIds] })).resolves.toEqualTypeOf<{ id: AuthorId }[]>();
  expectTypeOf(scalarIds).toEqualTypeOf<ScalarQuery<AuthorId>>();
  expectTypeOf(em.query({ from: ids, select: ids.id })).resolves.toEqualTypeOf<AuthorId[]>();
  ids.id.eq("a:1");
  ids.id.eq(b.author_id);
  expectTypeOf(ids.id.coalesce("a:1")).toEqualTypeOf<Expr<AuthorId, never>>();
  a.id.in(scalarIds);
  c.parent.in(scalarIds);

  // Given compound ordering expressed only through its selected name key
  const nameOrder = { name: "DESC NULLS FIRST" } as const;
  // And readonly ordering entries with an omitted optional direction
  const nameOrders = [undefined, { name: undefined }, { name: "ASC NULLS LAST" }] as const;
  // When paginating and ordering either directly or through query()
  // Then ordering and pagination do not alter the inferred rows
  expectTypeOf(em.query({ union: readonlyNames, orderBy: nameOrder, limit: 10, offset: 2 })).resolves.toEqualTypeOf<
    { name: string }[]
  >();
  expectTypeOf(query({ unionAll: readonlyNames, orderBy: nameOrders, limit: 10, offset: 2 })).toEqualTypeOf<
    Subquery<{ name: string }, "?">
  >();
  em.query({ union: readonlyNames, orderBy: [{ name: "ASC" }, { name: "DESC" }] });
  em.query({ union: readonlyNames, orderBy: [{ name: "ASC NULLS FIRST" }, { name: "DESC NULLS LAST" }] });
  expectTypeOf(
    em.query({
      union: [
        { ...authorNames, orderBy: [{ asc: a.age }], distinct: true, limit: 1, offset: 1 },
        { ...bookNames, orderBy: { name: "DESC" }, softDeletes: "include", pruneJoins: false },
      ],
      orderBy: { name: "ASC" },
    }),
  ).resolves.toEqualTypeOf<{ name: string }[]>();

  // Given statically known empty and single-operand tuples, not dynamic arrays
  const empty = [] as const;
  // And a readonly one-Author tuple that cannot satisfy minimum arity
  const single = [authorNames] as const;
  // When constructing or executing undersized compounds
  // Then each operator requires at least two operands
  // @ts-expect-error: UNION cannot execute an empty known tuple
  em.query({ union: [] });
  // @ts-expect-error: UNION cannot construct a one-operand query
  query({ union: [authorNames] });
  // @ts-expect-error: UNION ALL cannot execute a one-operand query
  em.query({ unionAll: [authorNames] });
  // @ts-expect-error: UNION ALL cannot construct an empty known tuple
  query({ unionAll: [] });
  // @ts-expect-error: INTERSECT cannot execute an empty known tuple
  em.query({ intersect: [] });
  // @ts-expect-error: INTERSECT cannot construct a one-operand query
  query({ intersect: [authorNames] });
  // @ts-expect-error: INTERSECT ALL cannot execute a one-operand query
  em.query({ intersectAll: [authorNames] });
  // @ts-expect-error: INTERSECT ALL cannot construct an empty known tuple
  query({ intersectAll: [] });
  // @ts-expect-error: EXCEPT cannot execute an empty known tuple
  em.query({ except: [] });
  // @ts-expect-error: EXCEPT cannot construct a one-operand query
  query({ except: [authorNames] });
  // @ts-expect-error: EXCEPT ALL cannot execute a one-operand query
  em.query({ exceptAll: [authorNames] });
  // @ts-expect-error: EXCEPT ALL cannot construct an empty known tuple
  query({ exceptAll: [] });
  // @ts-expect-error: readonly empty tuples still have invalid arity
  query({ union: empty });
  // @ts-expect-error: readonly single-operand tuples still have invalid arity
  em.query({ except: single });
  // @ts-expect-error: satisfies SetQuery also requires two known operands
  query({ union: single } satisfies SetQuery);

  // When optional-value sentinels occur at the first or a later operand position
  // Then none are pruned, even when two other valid operands remain
  // @ts-expect-error: omitting the first EXCEPT operand would change its meaning
  query({ except: [undefined, authorNames, bookNames] });
  // @ts-expect-error: null is not an EXCEPT operand
  em.query({ except: [null, authorNames, bookNames] });
  // @ts-expect-error: false is not an EXCEPT ALL operand
  query({ exceptAll: [false, authorNames, bookNames] });
  // @ts-expect-error: a later undefined UNION operand is not optional
  em.query({ union: [authorNames, bookNames, undefined] });
  // @ts-expect-error: a later null UNION ALL operand is not optional
  query({ unionAll: [authorNames, bookNames, null] });
  // @ts-expect-error: a later false INTERSECT operand is not optional
  em.query({ intersect: [authorNames, bookNames, false] });
  // @ts-expect-error: the operation value must be an array, not undefined
  query({ union: undefined });
  // @ts-expect-error: the operation value must be an array, not null
  em.query({ union: null });
  // @ts-expect-error: the operation value must be an array, not false
  query({ union: false });
  // @ts-expect-error: a compound root cannot claim two operations
  query({ union: readonlyNames, except: readonlyNames });
  // @ts-expect-error: execution also requires exactly one operation
  em.query({ intersect: readonlyNames, intersectAll: readonlyNames });
  // @ts-expect-error: an undefined second operation key is still a second operation
  query({ union: readonlyNames, except: undefined });
  // @ts-expect-error: a null second operation key is not omitted
  em.query({ union: readonlyNames, except: null });
  // @ts-expect-error: a false second operation key is not omitted
  query({ union: readonlyNames, except: false });

  // When ordinary SELECT clauses are attached to a compound root
  // Then callers must move them into a branch or an ordinary outer query
  // @ts-expect-error: FROM belongs to a branch, not the compound
  em.query({ union: readonlyNames, from: a });
  // @ts-expect-error: SELECT belongs to a branch, not the compound
  query({ union: readonlyNames, select: { name: a.first_name } });
  // @ts-expect-error: JOIN belongs to a branch, not the compound
  em.query({ union: readonlyNames, join: [{ left: b, on: b.author_id.eq(a.id) }] });
  // @ts-expect-error: WHERE belongs to a branch or an outer query
  query({ union: readonlyNames, where: a.first_name.ne("") });
  // @ts-expect-error: GROUP BY belongs to a branch or an outer query
  em.query({ union: readonlyNames, groupBy: [a.first_name] });
  // @ts-expect-error: HAVING belongs to a branch or an outer query
  query({ union: readonlyNames, having: a.id.count().gt(0) });
  // @ts-expect-error: DISTINCT is a branch clause, not a compound flag
  em.query({ union: readonlyNames, distinct: true });
  // @ts-expect-error: soft-delete policy belongs to each branch
  query({ union: readonlyNames, softDeletes: "include" });
  // @ts-expect-error: join pruning policy belongs to each branch
  em.query({ union: readonlyNames, pruneJoins: false });
  // @ts-expect-error: spreading an ordinary SELECT cannot create a compound root
  query({ ...authorNames, union: readonlyNames });

  // Given Book primary keys that have the wrong logical domain despite sharing Author's storage type
  const bookIds = { from: b, select: { id: b.id } } satisfies Query;
  // And a typed Book id for checking combined-column comparison and fallback inputs
  const bookId: BookId = "b:1";
  // When mixing Author and Book ids in compounds or subsequent expressions
  // Then every operator checks compatibility even if its output retains only the left row type
  // @ts-expect-error: UNION cannot combine Author and Book primary keys
  em.query({ union: [authorIds, bookIds] });
  // @ts-expect-error: UNION ALL cannot combine Book and Author primary keys in reverse order
  query({ unionAll: [bookIds, authorIds] });
  // @ts-expect-error: INTERSECT still requires compatible id domains
  em.query({ intersect: [authorIds, bookIds] });
  // @ts-expect-error: INTERSECT ALL still requires compatible id domains
  query({ intersectAll: [bookIds, authorIds] });
  // @ts-expect-error: EXCEPT still requires compatible id domains
  query({ except: [authorIds, bookIds] });
  // @ts-expect-error: EXCEPT ALL still requires compatible id domains
  em.query({ exceptAll: [bookIds, authorIds] });
  // @ts-expect-error: combined Author ids cannot compare against Book ids
  ids.id.eq(bookId);
  // @ts-expect-error: combined Author ids cannot use a Book-id fallback
  ids.id.coalesce(bookId);
  // @ts-expect-error: the scalar subquery selects the compound's Author ids, not Book ids
  b.id.in(scalarIds);

  // When POJO key sets or per-column value domains differ
  // Then equal column counts do not make the operands compatible
  // @ts-expect-error: the later branch is missing detail
  em.query({ union: [authorDetails, bookNames] });
  // @ts-expect-error: the later branch adds detail
  query({ union: [authorNames, bookDetails] });
  // @ts-expect-error: a renamed key is not the same key set
  em.query({ union: [authorNames, { from: b, select: { title: b.title } }] });
  // @ts-expect-error: the name key cannot switch from strings to numbers
  query({ union: [authorNames, { from: a, select: { name: a.age } }] });

  // When scalar SELECT inputs or scalar query values are supplied as set operands
  // Then every operator rejects them, even when all branches select compatible scalars
  // prettier-ignore
  // @ts-expect-error: UNION cannot execute inline scalar operands
  em.query({ union: [{ from: b, select: b.order }, { from: a, select: a.age }] });
  // @ts-expect-error: UNION ALL cannot construct a compound from scalar query values
  query({ unionAll: [orders, ages] });
  // prettier-ignore
  // @ts-expect-error: INTERSECT cannot construct a compound from inline scalar operands
  query({ intersect: [{ from: b, select: b.order }, { from: a, select: a.age }] });
  // @ts-expect-error: INTERSECT ALL cannot execute scalar query values
  em.query({ intersectAll: [orders, ages] });
  // prettier-ignore
  // @ts-expect-error: EXCEPT cannot execute inline scalar operands
  em.query({ except: [{ from: b, select: b.order }, { from: a, select: a.age }] });
  // @ts-expect-error: EXCEPT ALL cannot construct a compound from scalar query values
  query({ exceptAll: [orders, ages] });
  // @ts-expect-error: a scalar SELECT input remains invalid when stored in a variable
  query({ union: [leftOrders, leftOrders] });
  // @ts-expect-error: satisfies SetQuery also excludes scalar projections
  query({ union: [leftOrders, leftOrders] } satisfies SetQuery);
  // @ts-expect-error: the first inline operand must select a POJO
  query({ union: [{ from: b, select: b.title }, authorNames] });
  // @ts-expect-error: a later inline scalar cannot follow a POJO operand
  em.query({ union: [authorNames, { from: b, select: b.title }] });
  // @ts-expect-error: a scalar query value cannot be the first operand beside a POJO query value
  query({ union: [query({ from: b, select: b.title }), namedNames] });
  // @ts-expect-error: a later scalar query value cannot follow a POJO query value
  em.query({ except: [namedNames, query({ from: b, select: b.title })] });

  // Given an entity-mode POJO, which remains legal only as an ordinary query
  const authorEntities = { from: a, select: a } satisfies Query;
  // And the corresponding EntityQuery value, which carries no set-compatible columns
  const entityValue = query(authorEntities);
  // When entity results or ordinary expressions are supplied as operands
  // Then only POJO read queries and nested POJO compounds are eligible
  // @ts-expect-error: entity-mode POJOs cannot be UNION operands
  em.query({ union: [authorEntities, authorEntities] });
  // @ts-expect-error: EntityQuery values cannot be UNION operands
  query({ union: [entityValue, entityValue] });
  // @ts-expect-error: a later entity operand cannot follow a POJO operand
  em.query({ union: [authorNames, entityValue] });
  // @ts-expect-error: a modeled column is an expression, not a read query
  query({ union: [authorNames, b.order] });
  // @ts-expect-error: sql<R> is an expression assertion, not a POJO read query
  em.query({ union: [authorNames, sql<number>`1`] });
  // @ts-expect-error: direct execution must not accept a modeled column
  em.query(b.order);
  // @ts-expect-error: direct execution must not accept an aggregate expression
  em.query(b.id.count());
  // @ts-expect-error: direct execution must not accept arbitrary SQL expressions
  em.query(sql<number>`1`);
  // @ts-expect-error: scalar query values are expressions, not typed direct-execution inputs
  em.query(orders);
  // @ts-expect-error: coalesce returns an expression, not another executable query
  em.query(orders.coalesce(0));

  // Given ordering objects with one valid output key and one unknown key
  const unknownOrder = { name: "ASC", title: "DESC" } as const;
  // And a readonly array carrying the same extra key without an excess-property check at its declaration
  const unknownOrders = [unknownOrder] as const;
  // When ordering compounds directly instead of through an outer SELECT
  // Then only named output keys are allowed, including when order objects are variables
  // @ts-expect-error: title is a branch field name, not the name output key
  em.query({ union: readonlyNames, orderBy: { title: "ASC" } });
  // @ts-expect-error: an array entry cannot refer to an unknown output key
  query({ union: readonlyNames, orderBy: [{ title: "ASC" }] });
  // @ts-expect-error: an extra unknown key must not hide beside a valid name key
  em.query({ union: readonlyNames, orderBy: { name: "ASC", title: "DESC" } });
  // @ts-expect-error: variable-held order objects must reject extra unknown keys
  query({ union: readonlyNames, orderBy: unknownOrder });
  // @ts-expect-error: execution must also reject extra keys in variable-held order objects
  em.query({ union: readonlyNames, orderBy: unknownOrder });
  // @ts-expect-error: variable-held ordering arrays must reject extra unknown keys
  em.query({ union: readonlyNames, orderBy: unknownOrders });
  // @ts-expect-error: construction must also reject extra keys in variable-held ordering arrays
  query({ union: readonlyNames, orderBy: unknownOrders });
  // @ts-expect-error: directions use uppercase SQL literals
  query({ union: readonlyNames, orderBy: { name: "asc" } });
  // @ts-expect-error: a compound cannot order by a branch expression
  em.query({ union: readonlyNames, orderBy: [{ asc: a.first_name }] });
  // @ts-expect-error: arbitrary expression ordering requires an ordinary outer query
  query({ union: readonlyNames, orderBy: [{ desc: sql<string>`lower(${a.first_name})` }] });

  // When an otherwise compatible outer row hides an invalid nested compound
  // Then recursive checks validate the nested operands, not just the outer result shape
  // @ts-expect-error: a nested EXCEPT cannot hide incompatible Book ids behind its Author-id left row
  query({ union: [authorIds, { except: [authorIds, bookIds] }] });
  // @ts-expect-error: the first nested operand must be checked as well
  em.query({ union: [{ intersect: [authorIds, bookIds] }, authorIds] });
  // @ts-expect-error: nested EXCEPT must check its later operand's extra detail key
  em.query({ union: [authorNames, { except: [authorNames, bookDetails] }] });
  // @ts-expect-error: nested known tuples also require at least two operands
  query({ union: [authorNames, { except: [bookNames] }] });
  // @ts-expect-error: nested entity hydration is not a read-set operand
  query({ union: [authorNames, { union: [authorEntities, authorEntities] }] });
  // @ts-expect-error: a later nested scalar query value cannot hide behind EXCEPT's POJO left row
  em.query({ union: [authorNames, { except: [authorNames, query({ from: b, select: b.title })] }] });
  // @ts-expect-error: the first nested operand cannot select a scalar either
  query({ union: [{ intersect: [{ from: b, select: b.title }, authorNames] }, bookNames] });
  // prettier-ignore
  // @ts-expect-error: an all-scalar inline compound is not a later POJO set operand
  query({ union: [authorNames, { union: [{ from: a, select: a.first_name }, { from: b, select: b.title }] }] });
  // @ts-expect-error: an all-scalar reusable compound is not a first POJO set operand
  em.query({ union: [{ except: [orders, ages] }, bookNames] });
  // @ts-expect-error: nested ordering must reject unknown keys in variable-held objects too
  query({ union: [authorNames, { except: [authorNames, bookNames], orderBy: unknownOrder }] });
  // @ts-expect-error: nested compound roots cannot own WHERE clauses
  em.query({ union: [authorNames, { union: [authorNames, bookNames], where: a.first_name.ne("") }] });

  // Given an ordinary Query with its original explicit select and join type parameters
  const joinedAuthors: Query<{ name: typeof a.first_name; title: typeof b.title }, typeof leftBookNames.join> = {
    from: a,
    join: leftBookNames.join,
    select: { name: a.first_name, title: b.title },
  };
  // And an ordinary POJO widened too far by a bare Query annotation
  const widenedQuery: Query = authorNames;
  // When using ordinary inferred, satisfies, and explicitly parameterized queries
  // Then the set overloads preserve their original row types and entity mode
  expectTypeOf(em.query(authorNames)).resolves.toEqualTypeOf<{ name: string }[]>();
  expectTypeOf(query(authorNames)).toEqualTypeOf<Subquery<{ name: string }, "?">>();
  expectTypeOf(em.query(joinedAuthors)).resolves.toEqualTypeOf<{ name: string; title: string | null }[]>();
  expectTypeOf(query(joinedAuthors)).toEqualTypeOf<Subquery<{ name: string; title: string | null }, "?">>();
  // When an explicitly parameterized Query carries its join type in an optional property
  // Then set operands retain that declared LEFT join nullability
  expectTypeOf(em.query({ union: [joinedAuthors, joinedAuthors] })).resolves.toEqualTypeOf<
    { name: string; title: string | null }[]
  >();
  // And an explicitly parameterized scalar Query carries the same optional LEFT join property
  const annotatedOrders: Query<typeof b.order, typeof leftOrders.join> = leftOrders;
  // When constructing and executing that ordinary scalar query
  // Then its declared LEFT join remains nullable without making it a set operand
  expectTypeOf(query(annotatedOrders)).toEqualTypeOf<ScalarQuery<number | null>>();
  expectTypeOf(em.query(annotatedOrders)).resolves.toEqualTypeOf<(number | null)[]>();
  // @ts-expect-error: an explicit Query annotation does not make scalar projections eligible for sets
  query({ union: [annotatedOrders, annotatedOrders] });
  expectTypeOf(entityValue).toEqualTypeOf<EntityQuery<Author>>();
  expectTypeOf(em.query(authorEntities)).resolves.toEqualTypeOf<Author[]>();
  expectTypeOf(em.query(entityValue)).resolves.toEqualTypeOf<Author[]>();
  // @ts-expect-error: a bare Query annotation still loses the selected row type
  query(widenedQuery);
  // @ts-expect-error: direct execution still rejects a widened select
  em.query(widenedQuery);
  // @ts-expect-error: ordinary queries still require a source alias or a query value
  query({ from: authorNames, select: { name: a.first_name } });
  // @ts-expect-error: the set overload must not bypass ordinary source validation
  em.query({ from: authorNames, select: { name: a.first_name } });
  // @ts-expect-error: Book is absent from this ordinary query's source scope
  query({ from: a, select: { title: b.title } });
  // @ts-expect-error: direct execution must retain the same ordinary scope check
  em.query({ from: a, select: { title: b.title } });
  // @ts-expect-error: an ordinary query still requires SELECT
  query({ from: a });
  // @ts-expect-error: an ordinary query still requires FROM
  em.query({ select: { name: a.first_name } });

  // Given a reusable POJO with an output key that also names an ordinary query clause
  const selectedNames = query({ from: a, select: { select: a.first_name } });
  // When composing and sorting that POJO instead of inspecting its select-named expression as a clause
  const selectedUnion = query({ union: [selectedNames, selectedNames], orderBy: { select: "ASC" }, as: "selected" });
  // Then the subquery brand, not its column names, determines table identity
  expectTypeOf(selectedUnion).toEqualTypeOf<Subquery<{ select: string }, "selected">>();
  expectTypeOf(em.query(selectedUnion)).resolves.toEqualTypeOf<{ select: string }[]>();

  // Given POJO operands widened to the public input type, losing their selected column types
  const widenedOperands: NonNullable<SetQuery["union"]> = [authorNames, bookNames];
  // When passing a collection without a retained projection shape
  // Then it cannot infer a POJO row, even when a later operand has known columns
  // @ts-expect-error: widened operands must retain their literal query shapes with satisfies
  query({ union: widenedOperands });
  // @ts-expect-error: direct execution must also reject unknown operand row shapes
  em.query({ union: widenedOperands });
  // @ts-expect-error: a widened first SetOperand loses the projection even beside a known POJO
  query({ union: [widenedOperands[0], authorNames] });
  // @ts-expect-error: retaining only the first row does not recover its lost projection
  em.query({ except: [widenedOperands[0], authorNames] });
}
