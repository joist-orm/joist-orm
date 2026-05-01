import { type ParsedFindQuery } from "./QueryParser";
import { pruneUnusedJoins, selectReferencesAlias } from "./QueryParser.pruning";

describe("QueryParser.pruning", () => {
  describe("pruneUnusedJoins", () => {
    it("keeps intermediate aliases required by a dependent join's col1", () => {
      const query: ParsedFindQuery = {
        selects: ["a.*"],
        tables: [
          { join: "primary", alias: "a", table: "authors" },
          { join: "inner", alias: "b", table: "books", col1: "a.id", col2: "b.author_id" },
          { join: "inner", alias: "c", table: "comments", col1: "b.id", col2: "c.parent_book_id" },
        ],
        condition: {
          kind: "exp",
          op: "and",
          conditions: [{ kind: "raw", aliases: ["c"], condition: "c.id IS NOT NULL", bindings: [], pruneable: false }],
        },
        orderBys: [],
      };

      pruneUnusedJoins(query, []);

      expect(query.tables.map((table) => table.alias)).toEqual(["a", "b", "c"]);
    });

    it("keeps intermediate aliases required by a required CTE join", () => {
      const query: ParsedFindQuery = {
        selects: ["a.*"],
        tables: [
          { join: "primary", alias: "a", table: "authors" },
          { join: "inner", alias: "b", table: "books", col1: "a.id", col2: "b.author_id" },
          { join: "inner", alias: "c", table: "_comments", col1: "b.id", col2: "c.parent_book_id" },
        ],
        condition: undefined,
        orderBys: [],
        ctes: [
          {
            alias: "_comments",
            columns: [
              { columnName: "parent_book_id", dbType: "int" },
              { columnName: "id", dbType: "int" },
            ],
            query: { kind: "raw", sql: "SELECT parent_book_id, id FROM comments", bindings: [] },
          },
        ],
      };

      pruneUnusedJoins(query, []);

      expect(query.tables.map((table) => table.alias)).toEqual(["a", "b", "c"]);
    });

    it("keeps aliases referenced by raw select SQL when alias metadata is empty", () => {
      const query: ParsedFindQuery = {
        selects: ["a.*", { sql: "array_agg(br.rating::text) as review_ratings", bindings: [], aliases: [] }],
        tables: [
          { join: "primary", alias: "a", table: "authors" },
          { join: "outer", alias: "b", table: "books", col1: "a.id", col2: "b.author_id" },
          { join: "outer", alias: "br", table: "book_reviews", col1: "b.id", col2: "br.book_id" },
        ],
        condition: undefined,
        orderBys: [],
      };

      pruneUnusedJoins(query, []);

      // I.e. raw aggregate selects can reference joined aliases even when the parsed `aliases` metadata is empty.
      expect(query.tables.map((table) => table.alias)).toEqual(["a", "b", "br"]);
    });
  });

  describe("selectReferencesAlias", () => {
    it("finds simple select references", () => {
      expect(selectReferencesAlias("a.*", "a")).toBe(true);
      expect(selectReferencesAlias("a.id as id", "a")).toBe(true);
    });

    it("finds quoted select references", () => {
      expect(selectReferencesAlias('"a".*', "a")).toBe(true);
      expect(selectReferencesAlias('"book".id as __source_id', "book")).toBe(true);
    });

    it("finds aliases inside generated CTI expressions", () => {
      expect(selectReferencesAlias("COALESCE(p_s0.shared_column, p_s1.shared_column) as shared_column", "p_s0")).toBe(
        true,
      );
      expect(
        selectReferencesAlias("CASE WHEN p_s0.id IS NOT NULL THEN 'LargePublisher' ELSE '_' END as __class", "p_s0"),
      ).toBe(true);
    });

    it("does not match alias prefixes", () => {
      expect(selectReferencesAlias("p_s0.*", "p")).toBe(false);
      expect(selectReferencesAlias("book_m2m.id", "book")).toBe(false);
    });

    it("does not match aliases inside longer identifiers", () => {
      expect(selectReferencesAlias("foo.a.id", "a")).toBe(false);
      expect(selectReferencesAlias('foo_"a".id', "a")).toBe(false);
    });
  });
});
