import { selectReferencesAlias } from "./QueryParser.pruning";

describe("QueryParser.pruning", () => {
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
