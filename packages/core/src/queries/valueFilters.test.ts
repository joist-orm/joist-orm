import { parseValueFilter } from "src/queries/valueFilters.ts";

describe("valueFilters", () => {
  describe("parseValueFilter", () => {
    it("prunes false values for non-equality operators", () => {
      // Given disabled case-insensitive matching
      const ilike = { ilike: false };
      // And disabled word matching
      const search = { search: false };
      // When the optional text filters are parsed
      const ilikeConditions = parseValueFilter(ilike);
      const searchConditions = parseValueFilter(search);
      // Then neither filter restricts the matching rows
      expect(ilikeConditions).toEqual([]);
      expect(searchConditions).toEqual([]);
    });

    it("keeps false values for equality operators", () => {
      // Given an equality filter for a false boolean field
      const eq = { eq: false };
      // And an inequality filter for the same field value
      const ne = { ne: false };
      // When the boolean filters are parsed
      const eqConditions = parseValueFilter(eq);
      const neConditions = parseValueFilter(ne);
      // Then false remains a value to compare rather than disabling either filter
      expect(eqConditions).toEqual([{ kind: "eq", value: false }]);
      expect(neConditions).toEqual([{ kind: "ne", value: false }]);
    });

    it("parses search filters", () => {
      // Given a search for two words in a text field
      const filter = { search: "foo bar" };
      // When the search is parsed
      const conditions = parseValueFilter(filter);
      // Then the words match in order with text allowed between them
      expect(conditions).toEqual([{ kind: "ilike", value: "%foo%bar%" }]);
    });

    it("parses json path filters", () => {
      // Given a JSON filter for an orm tag
      const pathExists = { pathExists: '$.tags[*] ? (@ == "orm")' };
      // And a JSON filter for an active record
      const pathIsTrue = { pathIsTrue: "$.active == true" };
      // When the JSON filters are parsed
      const existsConditions = parseValueFilter(pathExists);
      const predicateConditions = parseValueFilter(pathIsTrue);
      // Then path existence and predicate matching retain their distinct operators
      expect(existsConditions).toEqual([{ kind: "jsonPathExists", value: '$.tags[*] ? (@ == "orm")' }]);
      expect(predicateConditions).toEqual([{ kind: "jsonPathPredicate", value: "$.active == true" }]);
    });
  });
});
