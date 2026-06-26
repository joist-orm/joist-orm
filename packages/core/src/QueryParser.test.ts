import { parseValueFilter } from "./QueryParser";

describe("QueryParser", () => {
  describe("parseValueFilter", () => {
    it("prunes false values for non-equality operators", () => {
      expect(parseValueFilter({ ilike: false })).toEqual([]);
      expect(parseValueFilter({ search: false })).toEqual([]);
    });

    it("keeps false values for equality operators", () => {
      expect(parseValueFilter({ eq: false })).toEqual([{ kind: "eq", value: false }]);
      expect(parseValueFilter({ ne: false })).toEqual([{ kind: "ne", value: false }]);
    });

    it("parses search filters", () => {
      expect(parseValueFilter({ search: "foo bar" })).toEqual([{ kind: "ilike", value: "%foo%bar%" }]);
    });

    it("parses json path filters", () => {
      expect(parseValueFilter({ pathExists: "$.tags[*] ? (@ == \"orm\")" })).toEqual([
        { kind: "jsonPathExists", value: "$.tags[*] ? (@ == \"orm\")" },
      ]);
      expect(parseValueFilter({ pathIsTrue: "$.active == true" })).toEqual([
        { kind: "jsonPathPredicate", value: "$.active == true" },
      ]);
    });
  });
});
