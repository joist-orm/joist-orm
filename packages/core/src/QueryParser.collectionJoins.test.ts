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
});
