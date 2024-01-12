import { getMetadata } from "joist-orm";

describe("EntityMetadata", () => {
  describe("getMetadata", () => {
    it("fails when passed undefined", () => {
      expect(() => getMetadata(undefined as any)).toThrow("Cannot getMetadata of undefined");
    });
  });
});
