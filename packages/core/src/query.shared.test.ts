import { expectTypeOf } from "expect-type";

import { AliasAssigner } from "./AliasAssigner.ts";
import {
  type Alias,
  type EntityAlias as FindEntityAlias,
  type PrimitiveAlias as FindPrimitiveAlias,
  getAliasMgmt,
  newAliasProxy,
} from "./Aliases.ts";
import { buildWhereClause } from "./drivers/buildUtils.ts";
import { type Entity } from "./Entity.ts";
import { type MaybeAbstractEntityConstructor } from "./EntityManager.ts";
import { type EntityMetadata } from "./EntityMetadata.ts";
import { type Expr, FnExpr, asNode, exprBrand } from "./Expr.ts";
import {
  type CheckReadQuery,
  Ctx,
  type Query,
  type SetQuery,
  conditionToSql,
  injectedConditions,
  isReadQueryValue,
  parseUserQuery,
  projectionToSql,
  query,
  sql,
} from "./query.ts";
import { parseFindQuery } from "./QueryParser.ts";
import { DateSerde, KeySerde, PrimitiveSerde } from "./serde.ts";
import { type PrimitiveColumn, type Table, getTableMgmt, newTableProxy } from "./Tables.ts";

describe("shared read compiler", () => {
  it("shares target scope, ordered projections, and column decoding without hydration", () => {
    // Given an Author target registered without a read FROM source
    const a = testTable();
    const ctx = new Ctx(new AliasAssigner(), undefined);
    ctx.register(getTableMgmt(a), "a");
    // And a hydrator that must not be used for expression projections
    const em = { hydrate: jest.fn() };
    // When compiling named and scalar projections through the shared helper
    const named = projectionToSql({ name: a.first_name, id: a.id, count: a.id.count() }, ctx);
    const scalar = projectionToSql(a.id, ctx);
    // Then projection order, aliases, and physical codecs are retained
    expect(named.selects.map((select) => select.sql)).toMatchInlineSnapshot(`
      [
        "a.first_name AS name",
        "a.id AS id",
        "count(a.id)::int AS "count"",
      ]
    `);
    expect(named.output.columns.map((column) => column[0])).toEqual(["name", "id", "count"]);
    expect(named.output.columns[1][1].outputType?.idMeta).toBe(getTableMgmt(a).meta);
    expect(
      named.decodeRows(em, [
        { name: "First", id: 1, count: "2" },
        { name: null, id: null, count: 0 },
      ]),
    ).toEqual([
      { name: "First", id: "a:1", count: 2 },
      { name: null, id: null, count: 0 },
    ]);
    expect(scalar.selects.map((select) => select.sql)).toMatchInlineSnapshot(`
      [
        "a.id AS value",
      ]
    `);
    expect(scalar.decodeRows(em, [{ value: 1 }, { value: null }])).toEqual(["a:1", null]);
    expect(em.hydrate).not.toHaveBeenCalled();
  });

  it("shares predicate pruning and metadata injections without a ParsedSource", () => {
    // Given a soft-deletable Author target in the mutation expression scope
    const a = testTable();
    const ctx = new Ctx(new AliasAssigner(), undefined);
    ctx.register(getTableMgmt(a), "a");
    // And a user condition whose only comparison prunes away
    const user = { and: [a.first_name.eq(undefined), { or: [undefined] }] };
    // When compiling the user guard separately from metadata conditions
    const guard = conditionToSql(user, ctx, true);
    const injected = conditionToSql(
      { and: injectedConditions({ meta: getTableMgmt(a).meta, alias: "a" }, "exclude") },
      ctx,
      true,
    );
    // Then injected soft-delete filtering cannot be mistaken for a surviving user guard
    expect(guard).toBeUndefined();
    expect(injected?.sql).toMatchInlineSnapshot(`"a.deleted_at IS NULL"`);
    expect(injected?.bindings).toEqual([]);
    expect(injectedConditions({ meta: getTableMgmt(a).meta, alias: "a" }, "include")).toEqual([]);
    expect(injectedConditions({ meta: undefined, alias: "sq" }, "exclude")).toEqual([]);
  });

  it("resolves frozen deferred conditions without changing the caller's leaves", () => {
    // Given frozen Author ID, cross-column, raw-column, aggregate, and template predicates
    const a = testTable();
    const id = Object.freeze(a.id.eq("a:1")!);
    const cross = Object.freeze(a.id.eq(a.id)!);
    const raw = Object.freeze(a.first_name.raw("LIKE ?", ["A%"]));
    const aggregate = Object.freeze(a.id.count().eq(2)!);
    const template = Object.freeze(sql.condition`${a.first_name} = ${"Alice"}`!);
    // And a frozen expression tree that retains an undefined comparison for pruning
    const where = { and: [id, cross, raw, aggregate, template, a.id.eq(undefined)] };
    Object.freeze(where.and);
    Object.freeze(where);
    // And two independent bindings for the same Author alias
    const firstCtx = new Ctx(new AliasAssigner(), undefined);
    firstCtx.register(getTableMgmt(a), "a");
    const secondCtx = new Ctx(new AliasAssigner(), undefined);
    secondCtx.register(getTableMgmt(a), "a1");
    // When resolving each occurrence against its own scope
    const first = conditionToSql(where, firstCtx, true);
    const second = conditionToSql(where, secondCtx, true);
    // Then each result retains its own SQL and the caller's leaves remain unresolved
    expect(first?.sql).toMatchInlineSnapshot(
      `"a.id = ? AND a.id = a.id AND a.first_name LIKE ? AND count(a.id)::int = ? AND a.first_name = ?"`,
    );
    expect(second?.sql).toMatchInlineSnapshot(
      `"a1.id = ? AND a1.id = a1.id AND a1.first_name LIKE ? AND count(a1.id)::int = ? AND a1.first_name = ?"`,
    );
    expect(first?.bindings).toEqual([1, "A%", 2, "Alice"]);
    expect(second?.bindings).toEqual([1, "A%", 2, "Alice"]);
    expect(id).toMatchObject({ alias: "unset" });
    expect(cross).toMatchObject({ aliases: [], condition: "unset" });
    expect(raw).toMatchObject({ aliases: [], condition: "unset" });
    expect(aggregate).toMatchObject({ aliases: [], condition: "<unresolved>", bindings: [] });
    expect(template).toMatchObject({ aliases: [], condition: "<unresolved>", bindings: [] });
  });

  it("keeps em.find alias resolution compatible with frozen reusable conditions", () => {
    // Given frozen Author alias conditions for the find parser
    const a = newAliasProxy(getTableMgmt(testTable()).meta.cstr) as Alias<Entity> & {
      id: FindEntityAlias<Entity>;
      firstName: FindPrimitiveAlias<string>;
    };
    const id = Object.freeze(a.id.eq("a:1")!);
    const raw = Object.freeze(a.firstName.raw("LIKE ?", ["A%"]));
    const cross = Object.freeze(a.id.eq(a.id)!);
    // And frozen find options that reuse these conditions
    const conditions = { and: [id, raw, cross] };
    Object.freeze(conditions.and);
    Object.freeze(conditions);
    // When parsing the find filter twice without a database connection
    const first = parseFindQuery(getAliasMgmt(a).meta, { as: a }, { conditions, softDeletes: "include" });
    const second = parseFindQuery(getAliasMgmt(a).meta, { as: a }, { conditions, softDeletes: "include" });
    // Then the visitor installs resolved clones while the source conditions remain reusable
    expect(buildWhereClause(first.condition!, true)?.[0]).toMatchInlineSnapshot(
      `"a.id = ? AND a.first_name LIKE ? AND a.id = a.id"`,
    );
    expect(buildWhereClause(second.condition!, true)?.[0]).toMatchInlineSnapshot(
      `"a.id = ? AND a.first_name LIKE ? AND a.id = a.id"`,
    );
    expect(buildWhereClause(first.condition!, true)?.[1]).toEqual([1, "A%"]);
    expect(id).toMatchObject({ alias: "unset" });
    expect(raw).toMatchObject({ aliases: [], condition: "unset" });
    expect(cross).toMatchObject({ aliases: [], condition: "unset" });
  });

  it("reuses a frozen correlated predicate through scalar projections", () => {
    // Given Author and mentor aliases with one frozen cross-column predicate
    const a = testTable();
    const mentor = testTable();
    const on = Object.freeze(mentor.id.eq(a.id)!);
    // And a scalar read whose own source is the mentor and whose ID predicate references the outer Author
    const scalar = query(Object.freeze({ from: mentor, where: on, select: mentor.id.count() }));
    // When compiling the enclosing read repeatedly
    const read = Object.freeze({ from: a, select: Object.freeze({ n: scalar }) });
    const first = parseUserQuery(read);
    const second = parseUserQuery(read);
    // Then nested resolution preserves the correlation and never assigns aliases to the frozen predicate
    expect(first.sql).toMatchInlineSnapshot(
      `"SELECT (SELECT count(a1.id)::int AS value FROM authors AS a1 WHERE a1.id = a.id AND a1.deleted_at IS NULL) AS n FROM authors AS a WHERE a.deleted_at IS NULL"`,
    );
    expect(second.sql).toBe(first.sql);
    expect(first.bindings).toEqual([]);
    expect(on).toMatchObject({ aliases: [], condition: "unset" });
  });

  it.each([
    { name: "null", value: null, error: "Query predicate must be a condition or an and/or group" },
    { name: "boolean", value: false, error: "Query predicate must be a condition or an and/or group" },
    { name: "array", value: [], error: "Query predicate must be a condition or an and/or group" },
    {
      name: "bare SQL expression",
      value: sql<boolean>`true`,
      error: "Query predicate must be a condition or an and/or group",
    },
    { name: "unknown leaf", value: { kind: "unknown" }, error: "Unknown query condition" },
    {
      name: "mixed group",
      value: { and: [], or: undefined },
      error: "Query conditions require exactly one and/or group",
    },
    { name: "non-array group", value: { and: {} }, error: "Query condition groups require an array" },
    {
      name: "unknown group clause",
      value: { and: [], otherwise: true },
      error: "Query condition group does not support 'otherwise'",
    },
    {
      name: "invalid prune policy",
      value: { or: [], pruneIfUndefined: null },
      error: "Invalid query pruneIfUndefined policy",
    },
    { name: "incomplete column", value: { kind: "column" }, error: "Malformed query column condition" },
    {
      name: "unknown column operator",
      value: { kind: "column", alias: "a", column: "id", dbType: "int", cond: { kind: "unknown", value: 1 } },
      error: "Malformed query column filter",
    },
    {
      name: "unknown filter clause",
      value: { kind: "column", alias: "a", column: "id", dbType: "int", cond: { kind: "eq", value: 1, extra: true } },
      error: "Query column filter does not support 'extra'",
    },
    {
      name: "unary filter value",
      value: { kind: "column", alias: "a", column: "id", dbType: "int", cond: { kind: "is-null", value: null } },
      error: "Unary query filters do not accept values",
    },
    {
      name: "non-array raw bindings",
      value: { kind: "raw", aliases: [], condition: "true", bindings: {}, pruneable: false },
      error: "Malformed query raw condition",
    },
  ])("rejects $name before an enclosing read predicate can prune", (testCase) => {
    // Given an Author read with an otherwise valid named projection
    const a = testTable();
    // And an invalid predicate inside a group that would prune because another child is undefined
    const where = { and: [undefined, { or: [testCase.value] }], pruneIfUndefined: "any" };
    // When compiling that group through the shared read condition path
    // Then pruning cannot conceal invalid condition grammar
    expect(() => parseUserQuery({ from: a, select: { id: a.id }, where })).toThrow(testCase.error);
  });

  it.each(["where", "having", "on"] as const)("validates scalar IN subquery %s before outer pruning", (clause) => {
    // Given an Author read and a reusable scalar ID source
    const a = testTable();
    const source = testTable();
    const read = { from: source, select: source.id };
    const scalar = query(read);
    // And a malformed nested predicate introduced after the scalar source was created
    const malformed = { and: [undefined], extra: source.id.eq("a:1") };
    Object.assign(read, clause === "on" ? { join: [{ left: a, on: malformed }] } : { [clause]: malformed });
    // And an enclosing IN condition whose group would otherwise prune entirely
    const where = { and: [undefined, a.id.in(scalar)], pruneIfUndefined: "any" };
    // When compiling the enclosing read, including an ON for an otherwise unreferenced join
    // Then every nested scalar predicate uses the same grammar checker before pruning
    expect(() => parseUserQuery({ from: a, select: { id: a.id }, where })).toThrow(
      "Query condition group does not support 'extra'",
    );
  });

  it("preserves undefined and skip pruning while accepting explicit SQL NULL comparisons", () => {
    // Given an Author scope for shared predicate compilation
    const a = testTable();
    const ctx = new Ctx(new AliasAssigner(), undefined);
    ctx.register(getTableMgmt(a), "a");
    // When compiling absent predicates, pruned comparisons, and a valid SQL NULL comparison
    // Then only explicit null predicate values are invalid, not IS NULL conditions or optional filters
    expect(conditionToSql(undefined, ctx, true)).toBeUndefined();
    expect(conditionToSql(a.id.eq(undefined), ctx, true)).toBeUndefined();
    expect(conditionToSql({ and: [undefined, a.id.eq(undefined)] }, ctx, true)).toBeUndefined();
    expect(conditionToSql(a.last_name.eq(null), ctx, true)?.sql).toMatchInlineSnapshot(`"a.last_name IS NULL"`);
    expect(conditionToSql(sql.condition`true`, ctx, true)?.sql).toMatchInlineSnapshot(`"true"`);
  });

  it("uses physical nullability rather than ORM derived-field requiredness", () => {
    // Given Author columns with different physical nullability and a derived NOT NULL column
    const a = testTable();
    // When inspecting shared SQL output facts
    const plan = parseUserQuery({ from: a, select: { id: a.id, name: a.last_name, books: a.number_of_books } });
    // Then nullable, NOT NULL, and ORM optionality stay distinct
    expect(getTableMgmt(a).meta.allFields.numberOfBooks.required).toBe(false);
    expect(plan.output.columns[0][1].sqlNullable).toBe(false);
    expect(plan.output.columns[1][1].sqlNullable).toBe(true);
    expect(plan.output.columns[2][1].sqlNullable).toBe(false);
  });

  it("keeps missing physical nullability unknown despite ORM requiredness and a known codec", () => {
    // Given an Author name marked required by the ORM
    const a = testTable();
    // And metadata with no physical SQL facts for that field
    Object.assign(getTableMgmt(a).meta.allFields.firstName.serde!.columns[0], { sqlNullable: undefined });
    // When inspecting the column's output facts
    // Then ORM requiredness alone does not prove SQL NOT NULL
    expect(asNode(a.first_name).sqlNullable).toBeUndefined();
    expect(asNode(a.first_name).outputType).toBeDefined();
  });

  it.each(["count", "countDistinct", "sum", "avg", "min", "max", "arrayAgg"] as const)(
    "describes %s nullability independently of the input column",
    (operation) => {
      // Given a physically NOT NULL derived Author count
      const a = testTable();
      // When describing an aggregate over that column
      const aggregate = asNode(a.number_of_books[operation]());
      // Then COUNT returns zero for no rows, while other aggregates return SQL NULL
      expect(aggregate.sqlNullable).toBe(operation !== "count" && operation !== "countDistinct");
      expect(asNode(a.first_name.stringAgg(",")).sqlNullable).toBe(true);
    },
  );

  it("nullifies LEFT-joined columns without nullifying COUNT or COALESCE or mutating expressions", () => {
    // Given an Author and a separately scoped mentor alias
    const a = testTable();
    const mentor = testTable();
    // And a shared required mentor name reused by joined and standalone reads
    const name = mentor.first_name;
    const read = {
      from: a,
      join: [{ left: mentor, on: mentor.id.eq(a.id) }],
      select: { name, n: mentor.id.count(), fallback: name.coalesce("none") },
    };
    // When compiling the read and exposing its reusable columns
    const plan = parseUserQuery(read);
    const derived = query(read);
    // Then the output's nullable wrapper leaves source expressions and codecs unchanged
    expect(plan.output.columns[0][1].sqlNullable).toBe(true);
    expect(plan.output.columns[0][1].outputType).toEqual(asNode(name).outputType);
    expect(plan.output.columns[1][1].sqlNullable).toBe(false);
    expect(plan.output.columns[2][1].sqlNullable).toBe(false);
    expect(asNode(derived.name).sqlNullable).toBe(true);
    expect(asNode(name).sqlNullable).toBe(false);
    expect(parseUserQuery({ from: mentor, select: { name } }).output.columns[0][1].sqlNullable).toBe(false);
    expect(
      parseUserQuery({ from: a, join: [{ inner: mentor, on: mentor.id.eq(a.id) }], select: { name } }).output
        .columns[0][1].sqlNullable,
    ).toBe(false);
  });

  it("nullifies a LEFT-joined derived COUNT column while preserving the inner COUNT", () => {
    // Given a reusable table with a NOT NULL count output
    const a = testTable();
    const counts = query({ from: a, select: { n: a.id.count() }, as: "counts" });
    // And an Author source that LEFT joins that derived table
    const read = { from: a, join: [{ left: counts, on: counts.n.gt(0) }], select: { n: counts.n } };
    // When compiling and wrapping the outer read
    const plan = parseUserQuery(read);
    const outer = query(read);
    // Then the derived row can be absent even though COUNT itself cannot be NULL
    expect(plan.output.columns[0][1].sqlNullable).toBe(true);
    expect(asNode(outer.n).sqlNullable).toBe(true);
    expect(asNode(counts.n).sqlNullable).toBe(false);
    expect(plan.output.columns[0][1].decode("3")).toBe(3);
    expect(plan.output.columns[0][1].encode(3)).toBe(3);
  });

  it.each(["union", "unionAll", "intersect", "intersectAll", "except", "exceptAll"] as const)(
    "combines physical nullable facts according to %s semantics",
    (operation) => {
      // Given a required Author name in the first branch
      const a = testTable();
      const first = { from: a, select: { name: a.first_name } };
      // And a nullable name in a later branch with the same storage codec
      const second = { from: a, select: { name: a.last_name } };
      // When compiling a set and its reversed operand order
      const plan = parseUserQuery({ [operation]: [first, second] });
      const reversed = parseUserQuery({ [operation]: [second, first] });
      // Then UNION admits NULL from either branch while EXCEPT/INTERSECT retain the left facts
      expect(plan.output.columns[0][1].sqlNullable).toBe(operation === "union" || operation === "unionAll");
      expect(reversed.output.columns[0][1].sqlNullable).toBe(true);
      expect(plan.output.columns[0][1].outputType).toEqual(asNode(a.first_name).outputType);
    },
  );

  it("propagates nullability through nested UNION reads and reusable output columns", () => {
    // Given one required and one nullable Author-name read
    const a = testTable();
    const required = { from: a, select: { name: a.first_name } };
    const nullable = { from: a, select: { name: a.last_name } };
    // And a nullable branch inside a non-first nested compound
    const combined = query({ unionAll: [required, { union: [required, nullable] }] });
    // When using the compound as an ordinary read source
    const plan = parseUserQuery({ from: combined, select: { name: combined.name } });
    // Then the outer named output still exposes possible SQL NULL
    expect(asNode(combined.name).sqlNullable).toBe(true);
    expect(plan.output.columns[0][1].sqlNullable).toBe(true);
    expect(plan.output.columns[0][1].decode("Alice")).toBe("Alice");
  });

  it("enumerates a nested named projection only once per output traversal", () => {
    // Given an Author projection that records key traversal without changing its columns
    const a = testTable();
    let enumerations = 0;
    const select = new Proxy(
      { id: a.id, name: a.first_name, lastName: a.last_name, books: a.number_of_books },
      {
        ownKeys(target) {
          enumerations++;
          return Reflect.ownKeys(target);
        },
      },
    );
    // And six ordinary wrappers that retain every column of the source
    let names = query({ from: a, select });
    for (let i = 0; i < 6; i++) names = query({ from: names, select: names });
    // And enumeration isolated from constructing those wrappers
    enumerations = 0;
    // When resolving one more wrapper's output metadata
    query({ from: names, select: names });
    // Then symbol-key validation shares the same traversal as output-column collection
    expect(enumerations).toBe(1);
  });

  it("keeps raw SQL and unmodeled refs unknown without treating sql<R> as a codec proof", () => {
    // Given typed raw SQL and an unmodeled Author column
    const a = testTable();
    const raw = sql<string>`'Alice'::varchar`;
    const ref = sql.ref<string>(a, "unmodeled");
    // When exposing their runtime facts and attempting a compound with a known column
    const plan = parseUserQuery({ from: a, select: { raw, ref } });
    // Then TypeScript result annotations establish neither physical nullability nor a safe codec
    expect(plan.output.columns[0][1].sqlNullable).toBeUndefined();
    expect(plan.output.columns[0][1].outputType).toBeUndefined();
    expect(plan.output.columns[1][1].sqlNullable).toBeUndefined();
    expect(plan.output.columns[1][1].outputType).toBeUndefined();
    expect(() =>
      query({
        union: [
          { from: a, select: { name: a.first_name } },
          { from: a, select: { name: raw } },
        ],
      }),
    ).toThrow("has an unknown or unsupported output codec");
  });

  it("keeps unknown branch nullability unknown even when its codec is known", () => {
    // Given a required Author-name projection
    const a = testTable();
    const first = { from: a, select: { name: a.first_name } };
    // And an internal function with a known codec but no SQL nullability contract
    const unknown = new FnExpr("unmodeled", [], { outputType: asNode(a.first_name).outputType });
    // When combining each possible nullable state with the unknown branch
    const plan = parseUserQuery({ unionAll: [first, { from: a, select: { name: unknown } }] });
    const nullable = parseUserQuery({
      unionAll: [
        { from: a, select: { name: a.last_name } },
        { from: a, select: { name: unknown } },
      ],
    });
    // Then unknown is not a NOT NULL guarantee, but a known nullable branch remains nullable
    expect(plan.output.columns[0][1].sqlNullable).toBeUndefined();
    expect(nullable.output.columns[0][1].sqlNullable).toBe(true);
  });

  it("keeps scalar query values nullable and non-executable while retaining scalar operands", () => {
    // Given a scalar Author-count query value
    const a = testTable();
    const scalar = query({ from: a, select: a.id.count() });
    // When inspecting it as an expression rather than a public execution input
    // Then zero rows can yield NULL, public execution rejects it, and inline scalar reads still decode
    expect(asNode(scalar).sqlNullable).toBe(true);
    expect(asNode(scalar.coalesce(0)).sqlNullable).toBe(false);
    expect(() => parseUserQuery(scalar)).toThrow("Scalar query values are expressions");
    expect(
      parseUserQuery({ from: a, select: a.id.count() }).decodeRows({ hydrate: jest.fn() }, [{ value: "2" }]),
    ).toEqual([2]);
    expect(() => parseUserQuery({ union: [scalar, scalar] })).toThrow("Set operations require POJO operands");
    expect(parseUserQuery({ from: a, select: { n: scalar } }).output.columns[0][1].sqlNullable).toBe(true);
  });

  it("preserves scalar ID alias identity for polymorphic IN with an unknown key codec", () => {
    // Given an Author and a LEFT-joined mentor with a custom key codec
    const a = testTable();
    const mentor = testTable();
    // And the mentor ID uses an unrecognized key conversion instead of the standard codec
    getTableMgmt(mentor).meta.allFields.id.serde = new CustomKeySerde("a", "id", "id", "int");
    // And a scalar projection of the mentor's ID, which polymorphic IN identifies by alias metadata
    const id = mentor.id;
    const read = { from: a, join: [{ left: mentor, on: id.eq(a.id) }], select: id };
    // When exposing the scalar expression and its separate SQL output facts
    const scalar = query(read);
    const plan = parseUserQuery(read);
    // Then NULL extension does not hide the original ID alias or invent codec compatibility
    expect(asNode(scalar).subquerySelect).toBe(id);
    expect(plan.output.columns[0][1].sqlNullable).toBe(true);
    expect(plan.output.columns[0][1].outputType).toBeUndefined();
  });

  it.each(["insert", "update", "delete", "values", "set", "returning", "allowAll"] as const)(
    "rejects %s on ordinary, compound, and nested read roots",
    (key) => {
      // Given a valid named Author read
      const a = testTable();
      const read = { from: a, select: { name: a.first_name } };
      // And invalid read hybrids carrying a mutation-only key, even when its value is undefined
      const hybrid = { ...read, [key]: undefined };
      const compound = { union: [read, read], [key]: undefined };
      // When accepting inputs through either the read-value or public compilation boundary
      // Then no mutation key is silently discarded in favor of the read shape
      expect(() => parseUserQuery(hybrid)).toThrow(`Read queries do not support mutation clause '${key}'`);
      expect(() => query(hybrid)).toThrow(`Read queries do not support mutation clause '${key}'`);
      expect(() => parseUserQuery(compound)).toThrow(`Read queries do not support mutation clause '${key}'`);
      expect(() => query({ union: [read, hybrid] })).toThrow(`Read queries do not support mutation clause '${key}'`);
      expect(() => parseUserQuery({ union: [read, { except: [read, hybrid] }] })).toThrow(
        `Read queries do not support mutation clause '${key}'`,
      );
    },
  );

  it("revalidates reusable read roots and permits mutation words as ordinary projection keys", () => {
    // Given a reusable Author read whose output is legitimately named returning
    const a = testTable();
    const read = { from: a, select: { returning: a.first_name } };
    const value = query(read);
    // When executing the unmodified read value
    expect(parseUserQuery(value).output.columns.map((column) => column[0])).toEqual(["returning"]);
    // And the original input is changed into an invalid hybrid after the value was created
    Object.assign(read, { update: a });
    // Then the previously created value does not bypass root validation
    expect(() => parseUserQuery(value)).toThrow("Read queries do not support mutation clause 'update'");
  });

  it.each(["insert", "update", "delete"] as const)("rejects a branded entity read mixed with %s", (key) => {
    // Given an entity-shaped Author read value
    const a = testTable();
    const entity = query({ from: a, select: a });
    // And a nonliteral hybrid with an own mutation operation and permission to affect every row
    const hybrid = { ...entity, [key]: a, allowAll: true };
    // When classifying and compiling the branded input
    // Then execute can route it to read validation, which rejects the attached mutation clauses
    expect(isReadQueryValue(hybrid)).toBe(true);
    expect(() => parseUserQuery(hybrid)).toThrow(`Read queries do not support mutation clause '${key}'`);
    expect(() => {
      // @ts-expect-error A branded entity read with mutation clauses is not a query POJO.
      query(hybrid);
    }).toThrow(`Read queries do not support mutation clause '${key}'`);
    expect(parseUserQuery(entity).output.kind).toBe("entity");
  });

  it("distinguishes projected mutation words from attached clauses on a table read value", () => {
    // Given a table-shaped Author read with legitimate output columns named after mutation operations
    const a = testTable();
    const value = query({ from: a, select: { insert: a.first_name, update: a.first_name, delete: a.first_name } });
    // When classifying and compiling the untouched proxy
    expect(isReadQueryValue(value)).toBe(true);
    expect(parseUserQuery(value).output.columns.map((column) => column[0])).toEqual(["insert", "update", "delete"]);
    // And an own mutation operation is attached to that proxy rather than declared in its projection
    Object.assign(value, { delete: a });
    // Then own clauses are rejected even when a virtual output column has the same name
    expect(() => parseUserQuery(value)).toThrow("Read queries do not support mutation clause 'delete'");
    expect(() => parseUserQuery({ from: value, select: value })).toThrow(
      "Read queries do not support mutation clause 'delete'",
    );
  });

  it.each(["with", "ctes", "typo"])("rejects unsupported %s clauses throughout read compilation", (key) => {
    // Given a valid named Author read and a previously created table value
    const a = testTable();
    const read = { from: a, select: { name: a.first_name } };
    const value = query(read);
    const name = value.name;
    // And an ordinary read carrying an unsupported clause, even when its value is undefined
    const invalid = { ...read, [key]: undefined };
    // When compiling roots and compound operands or creating reusable read values
    expect(() => parseUserQuery(invalid)).toThrow(`Read queries do not support clause '${key}'`);
    expect(() => query(invalid)).toThrow(`Read queries do not support clause '${key}'`);
    expect(() => parseUserQuery({ union: [read, invalid] })).toThrow(`Read queries do not support clause '${key}'`);
    // And the original source acquires the unsupported clause after a column expression was cached
    Object.assign(read, { [key]: [] });
    // Then nested FROM and scalar parser branches revalidate the stored query instead of discarding its clause
    expect(() => parseUserQuery({ from: value, select: { name } })).toThrow(
      `Read queries do not support clause '${key}'`,
    );
    expect(() => parseUserQuery(value)).toThrow(`Read queries do not support clause '${key}'`);
  });

  it("checks inherited and non-enumerable clauses and extra read-value symbols", () => {
    // Given an ordinary Author read and its entity-shaped read value
    const a = testTable();
    const read = { from: a, select: { name: a.first_name } };
    const entity = query({ from: a, select: a });
    // And unsupported clauses hidden from Object.keys on different input surfaces
    const inherited = Object.assign(Object.create({ ctes: [] }), read);
    const hidden = Object.defineProperty({ ...read }, "with", { value: [] });
    const branded = Object.assign({}, entity, { [Symbol("extra")]: [] });
    // When validating the complete root surface
    // Then these clauses cannot disappear through enumeration or branded unwrapping
    expect(() => parseUserQuery(inherited)).toThrow("Read queries do not support clause 'ctes'");
    expect(() => parseUserQuery(hidden)).toThrow("Read queries do not support clause 'with'");
    expect(() => parseUserQuery(branded)).toThrow("Read query values do not support clause 'Symbol(extra)'");
  });

  it("revalidates a scalar subquery root after its input gains an unsupported clause", () => {
    // Given a reusable scalar Author-count read
    const a = testTable();
    const read = { from: a, select: a.id.count() };
    const scalar = query(read);
    // And an unsupported CTE declaration added after the scalar value was created
    Object.assign(read, { with: [] });
    // When compiling that value inside a valid named projection
    // Then the nested scalar parser rejects the CTE instead of silently dropping it
    expect(() => parseUserQuery({ from: a, select: { n: scalar } })).toThrow(
      "Read queries do not support clause 'with'",
    );
  });

  it.each(["limit", "offset"] as const)("validates %s on ordinary, compound, and nested read roots", (key) => {
    // Given a valid named Author read
    const a = testTable();
    const read = { from: a, select: { name: a.first_name } };
    // And invalid pagination values that must not be passed through or treated as absence
    const invalid = [-1, 0.5, NaN, Infinity, -Infinity, null, "1", true];
    // When compiling different roots or creating reusable values across an unchecked input boundary
    // Then every read root requires a nonnegative finite integer
    for (const value of invalid) {
      const ordinary = { ...read, [key]: value };
      expect(() => parseUserQuery(ordinary)).toThrow(`Read query ${key} must be a nonnegative finite integer`);
      expect(() => query(ordinary as typeof read)).toThrow(`Read query ${key} must be a nonnegative finite integer`);
      expect(() => parseUserQuery({ unionAll: [read, read], [key]: value })).toThrow(
        `Read query ${key} must be a nonnegative finite integer`,
      );
      expect(() => parseUserQuery({ unionAll: [read, ordinary] })).toThrow(
        `Read query ${key} must be a nonnegative finite integer`,
      );
    }
  });

  it.each([
    {
      key: "softDeletes",
      values: [null, "all", false],
      error: "Read query softDeletes must be 'include' or 'exclude'",
    },
    { key: "distinct", values: [null, "false", 0], error: "Read query distinct must be a boolean" },
    { key: "pruneJoins", values: [null, "false", 0], error: "Read query pruneJoins must be a boolean" },
    { key: "as", values: [null, 1, false], error: "Read query as must be a string" },
  ])("validates read $key before applying defaults", (testCase) => {
    // Given a valid named Author read
    const a = testTable();
    const read = { from: a, select: { name: a.first_name } };
    // When compiling invalid scalar options across an unchecked input boundary
    // Then null and wrong-type values cannot silently select a default policy
    for (const value of testCase.values) {
      const invalid = { ...read, [testCase.key]: value };
      expect(() => parseUserQuery(invalid)).toThrow(testCase.error);
      expect(() => query(invalid as typeof read)).toThrow(testCase.error);
      expect(() => parseUserQuery({ unionAll: [read, invalid] })).toThrow(testCase.error);
    }
  });

  it("revalidates a stored source's alias option before accepting its read plan", () => {
    // Given a reusable named Author source and a cached column expression
    const a = testTable();
    const read = { from: a, select: { name: a.first_name }, as: "names" };
    const source = query(read);
    const name = source.name;
    // And a wrong-type alias added after creation, without accessing the source's columns again
    Object.assign(read, { as: 1 });
    // When compiling that source inside another ordinary read
    // Then nested parsing validates the stored options as well as the outer root
    expect(() => parseUserQuery({ from: source, select: { name } })).toThrow("Read query as must be a string");
  });

  it("accepts zero pagination and explicit false read flags without changing projections", () => {
    // Given an Author read with explicit false flags and included soft-deleted rows
    const a = testTable();
    const read = {
      from: a,
      select: { name: a.first_name },
      limit: 0,
      offset: 0,
      distinct: false,
      pruneJoins: false,
      softDeletes: "include",
      as: "names",
    };
    // When compiling the ordinary read and a compound with its own zero pagination
    const ordinary = parseUserQuery(read);
    const compound = parseUserQuery({ unionAll: [read, read], limit: 0, offset: 0, as: "combined" });
    // Then valid options retain projection order and parameterized pagination
    expect(ordinary.sql).toMatchInlineSnapshot(`"SELECT a.first_name AS name FROM authors AS a LIMIT ? OFFSET ?"`);
    expect(ordinary.bindings).toEqual([0, 0]);
    expect(ordinary.output.columns.map((column) => column[0])).toEqual(["name"]);
    expect(compound.bindings).toEqual([0, 0, 0, 0, 0, 0]);
    expect(compound.output.columns.map((column) => column[0])).toEqual(["name"]);
  });

  it.each([null, "literal", { polluted: true }])("decodes __proto__ as an own data property for %p", (value) => {
    // Given a named Author projection with keys that also exist on Object.prototype
    const a = testTable();
    const select = { ["__proto__"]: sql<unknown>`NULL`, constructor: a.first_name };
    // And a driver row with an own __proto__ value rather than a changed prototype
    const row = { ["__proto__"]: value, constructor: "Alice" };
    // When decoding a named SELECT through the shared projection decoder
    const plan = parseUserQuery({ from: a, select });
    const rows = plan.decodeRows({ hydrate: jest.fn() }, [row]);
    // Then every projected key survives without changing the result's ordinary object prototype
    expect(rows).toEqual([{ ["__proto__"]: value, constructor: "Alice" }]);
    expect(Object.hasOwn(rows[0], "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(rows[0])).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(rows[0], "__proto__")).toEqual({
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  });

  it("rejects source-shaped, empty, and malformed projections before rendering SQL", () => {
    // Given an Author alias and reusable entity/table reads that are not expression projections
    const a = testTable();
    const entity = query({ from: a, select: a });
    const table = query({ from: a, select: { name: a.first_name } });
    // And a registered target scope which would otherwise accept Author column expressions
    const ctx = new Ctx(new AliasAssigner(), undefined);
    ctx.register(getTableMgmt(a), "a");
    // When validating source-shaped or malformed RETURNING/select inputs
    // Then neither the root nor a named column can request entity hydration or an implicit table projection
    for (const value of [
      a,
      entity,
      table,
      {},
      [],
      [a.first_name],
      new Date(),
      null,
      undefined,
      1,
      { [exprBrand]: {} },
    ]) {
      expect(() => projectionToSql(value, ctx)).toThrow();
    }
    for (const value of [a, entity, table, [], undefined, "name"]) {
      expect(() => projectionToSql({ value }, ctx)).toThrow("select.value must be an expression");
    }
    expect(() => parseUserQuery({ from: a, select: {} })).toThrow("must not be empty");
    expect(() => parseUserQuery({ from: a, select: [a.first_name] })).toThrow("Expected a scalar expression");
    expect(() => projectionToSql({ name: a.first_name, [Symbol("hidden")]: a.id }, ctx)).toThrow(
      "Projection keys must be strings",
    );
  });

  it("forbids mutation keys on nonliteral Query and SetQuery inputs statically", () => {
    // Given valid ordinary and compound Author reads with retained literal projections
    const a = testTable();
    const read = { from: a, select: { name: a.first_name } };
    const compound = { union: [read, read] } as const;
    // And each mutation key added to these nonliteral read types
    type MutationKey = "insert" | "update" | "delete" | "values" | "set" | "returning" | "allowAll";
    type Hybrids = { [K in MutationKey]: (typeof read | typeof compound) & Record<K, unknown> }[MutationKey];
    // When checking assignability rather than fresh-literal excess properties
    // Then every hybrid is excluded from both public read input types
    expectTypeOf<typeof read>().toExtend<Query>();
    expectTypeOf<typeof compound>().toExtend<SetQuery>();
    expectTypeOf<Extract<Hybrids, Query | SetQuery>>().toEqualTypeOf<never>();
  });

  it("rejects nonliteral mutation hybrids at the query call signatures", () => {
    // Given a valid named Author read
    const a = testTable();
    const read = { from: a, select: { name: a.first_name } };
    // And nonliteral ordinary and compound inputs mixed with mutation operations
    const ordinary = { ...read, update: a };
    const compound = { union: [read, read], insert: a } as const;
    // When passing the hybrids through public overload inference
    // Then static rejection agrees with runtime classification
    expect(() => {
      // @ts-expect-error A nonliteral SELECT cannot also be an UPDATE.
      query(ordinary);
    }).toThrow("Read queries do not support mutation clause 'update'");
    expect(() => {
      // @ts-expect-error A nonliteral UNION cannot also be an INSERT.
      query(compound);
    }).toThrow("Read queries do not support mutation clause 'insert'");
  });

  it("checks concrete read source clauses without rejecting legitimate projected keys", () => {
    // Given ordinary, compound, and branded Author reads with retained literal output types
    const a = testTable();
    const read = { from: a, select: { name: a.first_name } };
    const compound = { union: [read, read] } as const;
    const projected = query({ from: a, select: { with: a.first_name, select: a.first_name, delete: a.first_name } });
    // And nonliteral source inputs carrying unsupported clauses at different depths
    const invalid = { ...read, typo: true };
    const nested = { unionAll: [read, invalid] } as const;
    const cte = { ...read, with: [] };
    // When intersecting concrete source types with the shared strict clause check
    // Then known read clauses and virtual projection names pass, but unknown source clauses do not
    expectTypeOf<typeof read>().toExtend<CheckReadQuery<typeof read>>();
    expectTypeOf<typeof compound>().toExtend<CheckReadQuery<typeof compound>>();
    expectTypeOf<typeof projected>().toExtend<CheckReadQuery<typeof projected>>();
    expectTypeOf<typeof invalid>().not.toExtend<CheckReadQuery<typeof invalid>>();
    expectTypeOf<typeof nested>().not.toExtend<CheckReadQuery<typeof nested>>();
    expect(() => {
      // @ts-expect-error An unknown clause cannot hide in a nonliteral compound operand.
      query(nested);
    }).toThrow("Read queries do not support clause 'typo'");
    expect(() => {
      // @ts-expect-error CTE declarations are not supported ordinary read clauses.
      query(cte);
    }).toThrow("Read queries do not support clause 'with'");
  });
});

/** An unrecognized key conversion must retain alias metadata without declaring a shared SQL codec. */
class CustomKeySerde extends KeySerde {}

/**
 * Supplies only compiler metadata, without loading integration entities or creating a database connection.
 * The derived Author.numberOfBooks is ORM-optional but physically NOT NULL, unlike Author.lastName.
 */
function testTable(): Table<Entity, "Author"> & {
  id: Expr<string, "Author">;
  first_name: PrimitiveColumn<string, never, "Author">;
  last_name: Expr<string | null, "Author">;
  number_of_books: Expr<number | null, "Author">;
} {
  function Author() {}
  const meta = {
    cstr: Author as unknown as MaybeAbstractEntityConstructor<Entity>,
    type: "Author",
    tableName: "authors",
    idType: "tagged-string",
    idDbType: "int",
    tagName: "a",
    baseTypes: [],
    subTypes: [],
    timestampFields: { deletedAt: "deletedAt" },
    allFields: {
      id: {
        kind: "primaryKey",
        fieldName: "id",
        required: true,
        serde: new KeySerde("a", "id", "id", "int", { sqlNullable: false, hasDefault: true, isGenerated: false }),
        aliasSuffix: "",
      },
      firstName: {
        kind: "primitive",
        fieldName: "firstName",
        required: true,
        serde: new PrimitiveSerde("firstName", "first_name", "varchar", false, false, {
          sqlNullable: false,
          hasDefault: false,
          isGenerated: false,
        }),
        aliasSuffix: "",
      },
      lastName: {
        kind: "primitive",
        fieldName: "lastName",
        required: false,
        serde: new PrimitiveSerde("lastName", "last_name", "varchar", false, false, {
          sqlNullable: true,
          hasDefault: false,
          isGenerated: false,
        }),
        aliasSuffix: "",
      },
      numberOfBooks: {
        kind: "primitive",
        fieldName: "numberOfBooks",
        required: false,
        derived: "async",
        serde: new PrimitiveSerde("numberOfBooks", "number_of_books", "int", false, false, {
          sqlNullable: false,
          hasDefault: false,
          isGenerated: false,
        }),
        aliasSuffix: "",
      },
      deletedAt: {
        kind: "primitive",
        fieldName: "deletedAt",
        required: false,
        serde: new DateSerde("deletedAt", "deleted_at", "timestamptz", false, false, {
          sqlNullable: true,
          hasDefault: false,
          isGenerated: false,
        }),
        aliasSuffix: "",
      },
    },
  } as unknown as EntityMetadata;
  meta.columns = {
    id: { fieldName: "id" },
    first_name: { fieldName: "firstName" },
    last_name: { fieldName: "lastName" },
    number_of_books: { fieldName: "numberOfBooks" },
    deleted_at: { fieldName: "deletedAt" },
  };
  meta.fields = meta.allFields;
  Object.assign(Author, { metadata: meta });
  return newTableProxy(meta.cstr) as ReturnType<typeof testTable>;
}
