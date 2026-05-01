import { type ParsedFindQuery } from "./QueryParser";
import { optimizeCollectionJoins } from "./QueryParser.collectionJoins";

describe("QueryParser.collectionJoins", () => {
  it("allows unblocked multiple collection left joins before pruning", () => {
    const query: ParsedFindQuery = {
      selects: ["a.*"],
      tables: [
        { alias: "a", table: "authors", join: "primary" },
        {
          alias: "b",
          table: "books",
          join: "outer",
          col1: "a.id",
          col2: "b.author_id",
          collection: { parentAlias: "a", rootAlias: "b", kind: "o2m" },
        },
        {
          alias: "c",
          table: "comments",
          join: "outer",
          col1: "a.id",
          col2: "c.parent_author_id",
          collection: { parentAlias: "a", rootAlias: "c", kind: "o2m" },
        },
      ],
      orderBys: [],
    };

    optimizeCollectionJoins(query, { pruneJoins: false });

    expect(query.tables).toMatchObject([
      { alias: "a", table: "authors", join: "primary" },
      { alias: "b", table: "books", join: "outer" },
      { alias: "c", table: "comments", join: "outer" },
    ]);
  });

  it("prunes unblocked multiple collection left joins after checking fanout safety", () => {
    const query: ParsedFindQuery = {
      selects: ["a.*"],
      tables: [
        { alias: "a", table: "authors", join: "primary" },
        {
          alias: "b",
          table: "books",
          join: "outer",
          col1: "a.id",
          col2: "b.author_id",
          collection: { parentAlias: "a", rootAlias: "b", kind: "o2m" },
        },
        {
          alias: "c",
          table: "comments",
          join: "outer",
          col1: "a.id",
          col2: "c.parent_author_id",
          collection: { parentAlias: "a", rootAlias: "c", kind: "o2m" },
        },
      ],
      orderBys: [],
    };

    optimizeCollectionJoins(query);

    expect(query.tables).toMatchObject([{ alias: "a", table: "authors", join: "primary" }]);
    expect(query.condition).toBeUndefined();
  });

  it("does not rewrite sibling OR when an alias is selected outside the OR", () => {
    const query: ParsedFindQuery = {
      selects: ["a.*", "b.title as book_title"],
      tables: [
        { alias: "a", table: "authors", join: "primary" },
        {
          alias: "b",
          table: "books",
          join: "outer",
          col1: "a.id",
          col2: "b.author_id",
          collection: { parentAlias: "a", rootAlias: "b", kind: "o2m" },
        },
        {
          alias: "c",
          table: "comments",
          join: "outer",
          col1: "a.id",
          col2: "c.parent_author_id",
          collection: { parentAlias: "a", rootAlias: "c", kind: "o2m" },
        },
      ],
      condition: {
        kind: "exp",
        op: "or",
        conditions: [
          { kind: "column", alias: "b", column: "id", dbType: "int", cond: { kind: "not-null" } },
          { kind: "column", alias: "c", column: "id", dbType: "int", cond: { kind: "not-null" } },
        ],
      },
      orderBys: [],
    };

    optimizeCollectionJoins(query, { allowMultipleLeftJoins: true });

    expect(query.tables).toMatchObject([
      { alias: "a", table: "authors", join: "primary" },
      { alias: "b", table: "books", join: "outer" },
      { alias: "c", table: "comments", join: "outer" },
    ]);
    expect(query.condition).toMatchObject({
      op: "or",
      conditions: [
        { kind: "column", alias: "b", column: "id" },
        { kind: "column", alias: "c", column: "id" },
      ],
    });
  });

  it("does not rewrite collection joins when selected aliases must remain in the outer query", () => {
    const query: ParsedFindQuery = {
      selects: ["b.id::text as id", "array_agg(br.rating::text) as review_ratings"],
      tables: [
        { alias: "a", table: "authors", join: "primary" },
        {
          alias: "b",
          table: "books",
          join: "outer",
          col1: "a.id",
          col2: "b.author_id",
          collection: { parentAlias: "a", rootAlias: "b", kind: "o2m" },
        },
        {
          alias: "br",
          table: "book_reviews",
          join: "outer",
          col1: "b.id",
          col2: "br.book_id",
          collection: { parentAlias: "b", rootAlias: "br", kind: "o2m" },
        },
      ],
      condition: {
        kind: "exp",
        op: "and",
        conditions: [
          {
            kind: "column",
            alias: "br",
            column: "rating",
            dbType: "int",
            cond: { kind: "not-null" },
          },
        ],
      },
      groupBys: [{ alias: "b", column: "id" }],
      orderBys: [],
    };

    optimizeCollectionJoins(query);

    expect(query.tables).toMatchObject([
      { alias: "a", table: "authors", join: "primary" },
      { alias: "b", table: "books", join: "outer" },
      { alias: "br", table: "book_reviews", join: "outer" },
    ]);
    expect(JSON.stringify(query.condition).includes('"kind":"exists"')).toEqual(false);
  });

  it("does not rewrite nested collection joins referenced by raw aggregate selects", () => {
    const query: ParsedFindQuery = {
      selects: ["a.id::text as id", { sql: "array_agg(br.rating::text) as review_ratings", bindings: [], aliases: [] }],
      tables: [
        { alias: "a", table: "authors", join: "primary" },
        {
          alias: "b",
          table: "books",
          join: "outer",
          col1: "a.id",
          col2: "b.author_id",
          collection: { parentAlias: "a", rootAlias: "b", kind: "o2m" },
        },
        {
          alias: "br",
          table: "book_reviews",
          join: "outer",
          col1: "b.id",
          col2: "br.book_id",
          collection: { parentAlias: "b", rootAlias: "br", kind: "o2m" },
        },
      ],
      condition: {
        kind: "exp",
        op: "and",
        conditions: [
          {
            kind: "column",
            alias: "br",
            column: "rating",
            dbType: "int",
            cond: { kind: "not-null" },
          },
        ],
      },
      groupBys: [{ alias: "a", column: "id" }],
      orderBys: [{ alias: "a", column: "id", order: "ASC" }],
    };

    optimizeCollectionJoins(query);

    // I.e. even if the raw select's `aliases` metadata is empty, `array_agg(br.rating)` keeps `br` in the
    // outer query; moving `br` under EXISTS would leave the aggregate with a dangling FROM reference.
    expect(query.tables).toMatchObject([
      { alias: "a", table: "authors", join: "primary" },
      { alias: "b", table: "books", join: "outer" },
      { alias: "br", table: "book_reviews", join: "outer" },
    ]);
    expect(JSON.stringify(query.condition).includes('"kind":"exists"')).toEqual(false);
  });

  it("does not rewrite m2m target joins referenced by raw aggregate selects", () => {
    const query: ParsedFindQuery = {
      selects: ["a.id::text as id", { sql: "array_agg(t.name::text) as tag_names", bindings: [], aliases: [] }],
      tables: [
        { alias: "a", table: "authors", join: "primary" },
        {
          alias: "att",
          table: "authors_to_tags",
          join: "outer",
          col1: "a.id",
          col2: "att.author_id",
          collection: { parentAlias: "a", rootAlias: "att", kind: "m2m" },
        },
        {
          alias: "t",
          table: "tags",
          join: "outer",
          col1: "att.tag_id",
          col2: "t.id",
          collection: { parentAlias: "att", rootAlias: "att", kind: "m2m" },
        },
      ],
      condition: {
        kind: "exp",
        op: "and",
        conditions: [
          {
            kind: "column",
            alias: "t",
            column: "name",
            dbType: "text",
            cond: { kind: "not-null" },
          },
        ],
      },
      groupBys: [{ alias: "a", column: "id" }],
      orderBys: [{ alias: "a", column: "id", order: "ASC" }],
    };

    optimizeCollectionJoins(query);

    // I.e. `t` is not the m2m collection root, but `array_agg(t.name)` still requires the `att -> t` join chain to
    // stay in the outer query.
    expect(query.tables).toMatchObject([
      { alias: "a", table: "authors", join: "primary" },
      { alias: "att", table: "authors_to_tags", join: "outer" },
      { alias: "t", table: "tags", join: "outer" },
    ]);
    expect(JSON.stringify(query.condition).includes('"kind":"exists"')).toEqual(false);
  });

  it("splits same-root anti-join ORs into NOT EXISTS OR EXISTS", () => {
    const query: ParsedFindQuery = {
      selects: ["a.*"],
      tables: [
        { alias: "a", table: "authors", join: "primary" },
        {
          alias: "b",
          table: "books",
          join: "outer",
          col1: "a.id",
          col2: "b.author_id",
          collection: { parentAlias: "a", rootAlias: "b", kind: "o2m" },
        },
        {
          alias: "br",
          table: "book_reviews",
          join: "outer",
          col1: "b.id",
          col2: "br.book_id",
          collection: { parentAlias: "b", rootAlias: "br", kind: "o2m" },
        },
      ],
      condition: {
        kind: "exp",
        op: "or",
        conditions: [
          { kind: "column", alias: "b", column: "id", dbType: "int", cond: { kind: "is-null" } },
          { kind: "column", alias: "br", column: "rating", dbType: "int", cond: { kind: "eq", value: 5 } },
        ],
      },
      orderBys: [],
    };

    optimizeCollectionJoins(query);

    // I.e. the anti-join branch must become `NOT EXISTS (books)`, while the positive review branch can become its
    // own correlated `EXISTS`; keeping `b.id IS NULL` inside an `EXISTS (books ...)` would make it impossible.
    expect(query.tables).toMatchObject([{ alias: "a", table: "authors", join: "primary" }]);
    expect(query.condition).toMatchObject({
      kind: "exp",
      op: "or",
      conditions: [
        {
          kind: "exists",
          negate: true,
          subquery: {
            tables: [{ alias: "b", table: "books", join: "primary" }],
            condition: { op: "and", conditions: [{ kind: "raw", condition: "a.id = b.author_id" }] },
          },
        },
        {
          kind: "exists",
          negate: false,
          subquery: {
            tables: [{ alias: "b", table: "books", join: "primary" }],
            condition: {
              op: "and",
              conditions: [
                { kind: "raw", condition: "a.id = b.author_id" },
                {
                  kind: "exists",
                  negate: false,
                  subquery: { tables: [{ alias: "br", table: "book_reviews", join: "primary" }] },
                },
              ],
            },
          },
        },
      ],
    });
  });

  it("does not split same-row positive branches into unrelated EXISTS clauses", () => {
    const query: ParsedFindQuery = {
      selects: ["a.*"],
      tables: [
        { alias: "a", table: "authors", join: "primary" },
        {
          alias: "b",
          table: "books",
          join: "outer",
          col1: "a.id",
          col2: "b.author_id",
          collection: { parentAlias: "a", rootAlias: "b", kind: "o2m" },
        },
        {
          alias: "br",
          table: "book_reviews",
          join: "outer",
          col1: "b.id",
          col2: "br.book_id",
          collection: { parentAlias: "b", rootAlias: "br", kind: "o2m" },
        },
      ],
      condition: {
        kind: "exp",
        op: "or",
        conditions: [
          { kind: "column", alias: "b", column: "id", dbType: "int", cond: { kind: "is-null" } },
          {
            kind: "exp",
            op: "and",
            conditions: [
              { kind: "column", alias: "b", column: "title", dbType: "text", cond: { kind: "eq", value: "b1" } },
              { kind: "column", alias: "br", column: "rating", dbType: "int", cond: { kind: "eq", value: 5 } },
            ],
          },
        ],
      },
      orderBys: [],
    };

    optimizeCollectionJoins(query);

    // I.e. the positive branch must stay one `EXISTS (books WHERE b.title = ... AND EXISTS reviews ...)`, not split
    // into independent `EXISTS (books title = ...) AND EXISTS (reviews rating = ...)` clauses that can match different rows.
    expect(query.tables).toMatchObject([{ alias: "a", table: "authors", join: "primary" }]);
    expect(query.condition).toMatchObject({
      kind: "exp",
      op: "or",
      conditions: [
        { kind: "exists", negate: true, subquery: { tables: [{ alias: "b", join: "primary" }] } },
        {
          kind: "exists",
          negate: false,
          subquery: {
            tables: [{ alias: "b", table: "books", join: "primary" }],
            condition: {
              op: "and",
              conditions: [
                { kind: "raw", condition: "a.id = b.author_id" },
                {
                  kind: "exp",
                  op: "and",
                  conditions: [{ kind: "column", alias: "b", column: "title", cond: { kind: "eq", value: "b1" } }],
                },
                {
                  kind: "exists",
                  negate: false,
                  subquery: { tables: [{ alias: "br", table: "book_reviews", join: "primary" }] },
                },
              ],
            },
          },
        },
      ],
    });
  });
});
