import { isTaggedId, keyToNumber, setTaggedIdDelimiter, tagFromId, tagId, unsafeDeTagIds } from "joist-orm";

describe("keys", () => {
  describe("isTaggedId", () => {
    it("works on int ids", () => {
      expect(isTaggedId("a:1")).toBe(true);
      expect(isTaggedId("a1")).toEqual(false);
    });

    it("works on uuid ids", () => {
      expect(isTaggedId("a:20000000-0000-0000-0000-000000000000")).toBe(true);
    });

    it("fails on incorrect tag", () => {
      const meta: any = { tagName: "b" };
      expect(isTaggedId(meta, "a:1")).toBe(false);
    });

    it("fails on invalid int ids", () => {
      const meta: any = { idType: "int" };
      expect(isTaggedId(meta, "a:1d")).toBe(false);
    });

    it("fails on invalid uuid ids", () => {
      const meta: any = { idType: "uuid" };
      expect(isTaggedId(meta, "a:20000000-0000-0000-0000-00000000000!")).toBe(false);
    });
  });

  it("supports a custom tag delimiter", () => {
    const meta: any = { tagName: "author", idDbType: "int" };
    setTaggedIdDelimiter("_");
    try {
      expect(tagId(meta, 1)).toEqual("author_1");
      expect(keyToNumber(meta, "author_1")).toEqual(1);
      expect(isTaggedId("author_1")).toEqual(true);
      expect(tagFromId("author_1")).toEqual("author");
      expect(unsafeDeTagIds(["author_1"])).toEqual(["1"]);
    } finally {
      setTaggedIdDelimiter(":");
    }
  });
});
