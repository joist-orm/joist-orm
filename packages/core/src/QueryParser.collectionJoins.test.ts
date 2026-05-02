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

  it("skips join-to-exists optimization when disabled", () => {
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
      ],
      condition: {
        kind: "exp",
        op: "and",
        conditions: [{ kind: "column", alias: "b", column: "title", dbType: "text", cond: { kind: "eq", value: "b1" } }],
      },
      orderBys: [],
    };

    optimizeCollectionJoins(query, { optimizeJoinsToExists: false });

    expect(query.tables).toMatchObject([
      { alias: "a", table: "authors", join: "primary" },
      { alias: "b", table: "books", join: "outer" },
    ]);
    expect(query.condition).toMatchObject({
      op: "and",
      conditions: [{ kind: "column", alias: "b", column: "title" }],
    });
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

  it("keeps non-parent correlation aliases required by collection EXISTS", () => {
    const query: ParsedFindQuery = {
      selects: ["pp.*"],
      tables: [
        { alias: "pp", table: "plan_packages", join: "primary" },
        {
          alias: "pp_b0",
          table: "ready_plans",
          join: "outer",
          col1: "pp.id",
          col2: "pp_b0.id",
          distinct: false,
        },
        {
          alias: "_pp_b0_version",
          table: "ready_plan_versions",
          join: "outer",
          col1: "pp_b0.id",
          col2: "_pp_b0_version.identity_id",
        },
        {
          alias: "_pp_version",
          table: "plan_package_versions",
          join: "outer",
          col1: "_pp_b0_version.id",
          col2: "_pp_version.id",
        },
        {
          alias: "rpm",
          table: "ready_plan_version_to_markets",
          join: "outer",
          col1: "_pp_version.id",
          col2: "rpm.ready_plan_version_id",
          collection: { parentAlias: "pp", rootAlias: "rpm", kind: "m2m" },
        },
      ],
      condition: {
        kind: "exp",
        op: "and",
        conditions: [{ kind: "column", alias: "rpm", column: "market_id", dbType: "int", cond: { kind: "in", value: [2] } }],
      },
      orderBys: [{ alias: "pp", column: "id", order: "ASC" }],
    };

    optimizeCollectionJoins(query);

    // I.e. the collection metadata points at parent `pp`, but the actual EXISTS correlation uses `_pp_version`.
    // Pruning must keep the whole `pp_b0 -> _pp_b0_version -> _pp_version` dependency chain in the outer query.
    expect(query.tables).toMatchObject([
      { alias: "pp", table: "plan_packages", join: "primary" },
      { alias: "pp_b0", table: "ready_plans", join: "outer" },
      { alias: "_pp_b0_version", table: "ready_plan_versions", join: "outer" },
      { alias: "_pp_version", table: "plan_package_versions", join: "outer" },
    ]);
    expect(query.condition).toMatchObject({
      kind: "exp",
      op: "and",
      conditions: [
        {
          kind: "exists",
          outerAliases: ["_pp_version"],
          subquery: {
            tables: [{ alias: "rpm", table: "ready_plan_version_to_markets", join: "primary" }],
            condition: {
              op: "and",
              conditions: [
                // I.e. `_pp_version` must be tracked as the outer alias, not just the declared collection parent `pp`.
                { kind: "raw", aliases: ["rpm", "_pp_version"], condition: "_pp_version.id = rpm.ready_plan_version_id" },
                { kind: "column", alias: "rpm", column: "market_id", cond: { kind: "in", value: [2] } },
              ],
            },
          },
        },
      ],
    });
  });

  it("rewrites collection branches inside mixed ordinary and collection ORs", () => {
    const query: ParsedFindQuery = {
      selects: ["a.*"],
      tables: [
        { alias: "a", table: "authors", join: "primary" },
        { alias: "p", table: "publishers", join: "outer", col1: "a.publisher_id", col2: "p.id" },
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
          { kind: "column", alias: "p", column: "name", dbType: "text", cond: { kind: "ilike", value: "%foo%" } },
          { kind: "column", alias: "b", column: "title", dbType: "text", cond: { kind: "ilike", value: "%foo%" } },
          { kind: "column", alias: "c", column: "text", dbType: "text", cond: { kind: "ilike", value: "%foo%" } },
        ],
      },
      orderBys: [{ alias: "a", column: "id", order: "ASC" }],
    };

    optimizeCollectionJoins(query);

    // I.e. the ordinary `p` branch stays joined, while independent collection branches become scoped EXISTS clauses.
    expect(query.tables).toMatchObject([
      { alias: "a", table: "authors", join: "primary" },
      { alias: "p", table: "publishers", join: "outer" },
    ]);
    expect(query.condition).toMatchObject({
      kind: "exp",
      op: "or",
      conditions: [
        { kind: "column", alias: "p", column: "name", cond: { kind: "ilike", value: "%foo%" } },
        {
          kind: "exists",
          subquery: {
            tables: [{ alias: "b", table: "books", join: "primary" }],
            condition: {
              op: "and",
              conditions: [
                { kind: "raw", condition: "a.id = b.author_id" },
                { kind: "column", alias: "b", column: "title", cond: { kind: "ilike", value: "%foo%" } },
              ],
            },
          },
        },
        {
          kind: "exists",
          subquery: {
            tables: [{ alias: "c", table: "comments", join: "primary" }],
            condition: {
              op: "and",
              conditions: [
                { kind: "raw", condition: "a.id = c.parent_author_id" },
                { kind: "column", alias: "c", column: "text", cond: { kind: "ilike", value: "%foo%" } },
              ],
            },
          },
        },
      ],
    });
  });

  it("preserves optional joins under collection EXISTS for nullable OR branches", () => {
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
        { alias: "br", table: "book_reviews", join: "outer", col1: "b.id", col2: "br.book_id" },
        { alias: "c", table: "comments", join: "outer", col1: "b.id", col2: "c.parent_book_id" },
      ],
      condition: {
        kind: "exp",
        op: "and",
        conditions: [
          {
            kind: "exp",
            op: "or",
            conditions: [
              { kind: "column", alias: "br", column: "rating", dbType: "int", cond: { kind: "eq", value: 5 } },
              { kind: "column", alias: "c", column: "text", dbType: "text", cond: { kind: "eq", value: "match" } },
            ],
          },
        ],
      },
      orderBys: [],
    };

    optimizeCollectionJoins(query);

    // I.e. an OR across optional descendants must be evaluated after LEFT JOINs, not after INNER JOINs that require
    // every nullable branch to exist before any branch can match.
    // I.e. only the parent table remains in the outer query; `b`/`br`/`c` moved under EXISTS.
    expect(query.tables).toMatchObject([{ alias: "a", table: "authors", join: "primary" }]);
    expect(query.condition).toMatchObject({
      kind: "exp",
      op: "and",
      conditions: [
        {
          kind: "exists",
          subquery: {
            tables: [
              // I.e. `b` is the collection root and becomes the EXISTS subquery's FROM table.
              { alias: "b", table: "books", join: "primary" },
              // I.e. `br` must stay nullable so the `c.text = match` OR branch can match without a review row.
              { alias: "br", table: "book_reviews", join: "outer", distinct: false },
              // I.e. `c` must stay nullable so the `br.rating = 5` OR branch can match without a comment row.
              { alias: "c", table: "comments", join: "outer", distinct: false },
            ],
            condition: {
              op: "and",
              conditions: [
                // I.e. this correlation is required after moving `b` out of the outer query.
                { kind: "raw", condition: "a.id = b.author_id" },
                {
                  kind: "exp",
                  op: "or",
                  conditions: [
                    // I.e. these branch aliases must remain in one OR under the LEFT JOINs, not become required joins.
                    { kind: "column", alias: "br", column: "rating", cond: { kind: "eq", value: 5 } },
                    { kind: "column", alias: "c", column: "text", cond: { kind: "eq", value: "match" } },
                  ],
                },
              ],
            },
          },
        },
      ],
    });
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

  it("splits same-root id IS NULL OR id IN list into NOT EXISTS OR EXISTS", () => {
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
      ],
      condition: {
        kind: "exp",
        op: "or",
        conditions: [
          { kind: "column", alias: "b", column: "id", dbType: "int", cond: { kind: "is-null" } },
          { kind: "column", alias: "b", column: "id", dbType: "int", cond: { kind: "in", value: [1, 2] } },
        ],
      },
      orderBys: [],
    };

    optimizeCollectionJoins(query);

    // I.e. `b.id IS NULL OR b.id IN (...)` means "no books OR one of these books"; the null branch must not be
    // evaluated inside an `EXISTS (books ...)`, where `b.id IS NULL` can never match a real child row.
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
                { kind: "column", alias: "b", column: "id", cond: { kind: "in", value: [1, 2] } },
              ],
            },
          },
        },
      ],
    });
  });

  it("splits m2m target id IS NULL OR id IN list into NOT EXISTS OR EXISTS", () => {
    const query: ParsedFindQuery = {
      selects: ["a.*"],
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
        op: "or",
        conditions: [
          { kind: "column", alias: "t", column: "id", dbType: "int", cond: { kind: "is-null" } },
          { kind: "column", alias: "t", column: "id", dbType: "int", cond: { kind: "in", value: [1, 2] } },
        ],
      },
      orderBys: [],
    };

    optimizeCollectionJoins(query);

    // I.e. m2m target `t.id IS NULL` means no matching membership row, so it must split against root `att`.
    expect(query.tables).toMatchObject([{ alias: "a", table: "authors", join: "primary" }]);
    expect(query.condition).toMatchObject({
      kind: "exp",
      op: "or",
      conditions: [
        {
          kind: "exists",
          negate: true,
          subquery: {
            tables: [{ alias: "att", table: "authors_to_tags", join: "primary" }],
            condition: { op: "and", conditions: [{ kind: "raw", condition: "a.id = att.author_id" }] },
          },
        },
        {
          kind: "exists",
          negate: false,
          subquery: {
            tables: [
              { alias: "att", table: "authors_to_tags", join: "primary" },
              { alias: "t", table: "tags", join: "outer", distinct: false },
            ],
            condition: {
              op: "and",
              conditions: [
                { kind: "raw", condition: "a.id = att.author_id" },
                { kind: "column", alias: "t", column: "id", cond: { kind: "in", value: [1, 2] } },
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
