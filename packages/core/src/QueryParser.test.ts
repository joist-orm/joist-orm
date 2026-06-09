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
  });
});
