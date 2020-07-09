import { collectionName, makeEntity } from "./EntityDbMetadata";

const relationDummy: any = { targetTable: { m2oRelations: [] } };
const configDummy: any = { relationNameOverrides: {} };

describe("EntityDbMetadata", () => {
  describe("collectionName", () => {
    it("handles base case", () => {
      expect(collectionName(configDummy, makeEntity("Author"), makeEntity("Book"), relationDummy)).toEqual("books");
    });

    it("handles author/mentor", () => {
      expect(collectionName(configDummy, makeEntity("Author"), makeEntity("Author"), relationDummy)).toEqual("authors");
    });

    it("handles book/book review", () => {
      expect(collectionName(configDummy, makeEntity("Book"), makeEntity("BookReview"), relationDummy)).toEqual(
        "reviews",
      );
    });
  });
});
