import { isTaggedId } from "joist-orm";

describe("keys", () => {
  describe("isTaggedId", () => {
    it("works on int ids", () => {
      expect(isTaggedId("a:1")).toBe(true);
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
      expect(isTaggedId(meta,"a:20000000-0000-0000-0000-00000000000!")).toBe(false);
    });
  });
});
