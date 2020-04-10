import { collectionName, makeEntity } from "./EntityDbMetadata";

describe("EntityDbMetadata", () => {
  describe("collectionName", () => {
    it("handles base case", () => {
      expect(collectionName(makeEntity("Author"), makeEntity("Book"))).toEqual("books");
    });

    it("handles author/mentor", () => {
      expect(collectionName(makeEntity("Author"), makeEntity("Author"))).toEqual("authors");
    });

    it("handles book/book review", () => {
      expect(collectionName(makeEntity("Book"), makeEntity("BookReview"))).toEqual("reviews");
    });
  });
});
