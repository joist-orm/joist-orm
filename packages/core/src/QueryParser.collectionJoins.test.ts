import { optimizeCollectionJoins } from "./QueryParser.collectionJoins";
import { type ParsedFindQuery } from "./QueryParser";

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
});
