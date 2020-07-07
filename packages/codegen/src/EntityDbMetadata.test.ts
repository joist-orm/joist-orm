import { collectionName, makeEntity } from "./EntityDbMetadata";

const relationDummy: any = { targetTable: { m2oRelations: [] } };
describe("EntityDbMetadata", () => {
  describe("collectionName", () => {
    it("handles base case", () => {
      expect(collectionName(makeEntity("Author"), makeEntity("Book"), relationDummy)).toEqual("books");
    });

    it("handles author/mentor", () => {
      expect(collectionName(makeEntity("Author"), makeEntity("Author"), relationDummy)).toEqual("authors");
    });

    it("handles book/book review", () => {
      expect(collectionName(makeEntity("Book"), makeEntity("BookReview"), relationDummy)).toEqual("reviews");
    });
  });
});
