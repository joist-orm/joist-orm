import { Author } from "@src/entities";
import { insertAuthor, insertBook, insertBookReview, insertComment } from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { isLoaded } from "joist-orm";

describe("isLoaded", () => {
  describe("with a string hint", () => {
    it("returns true for a loaded relation", async () => {
      await insertAuthor({ first_name: "a" });
      await insertBook({ author_id: 1, title: "t" });
      const em = newEntityManager();
      const author = await em.load(Author, "1", "books");
      expect(isLoaded(author, "books")).toEqual(true);
    });

    it("returns false for an  unloaded relation", async () => {
      await insertAuthor({ first_name: "a" });
      await insertBook({ author_id: 1, title: "t" });
      const em = newEntityManager();
      const author = await em.load(Author, "1");
      expect(isLoaded(author, "books")).toEqual(false);
    });
  });

  describe("with an array hint", () => {
    it("returns true if all relations are loaded", async () => {
      await insertAuthor({ first_name: "a" });
      await insertAuthor({ first_name: "b", mentor_id: 1 });
      await insertBook({ author_id: 1, title: "t" });
      const em = newEntityManager();
      const author = await em.load(Author, "2", ["books", "mentor"]);
      expect(isLoaded(author, ["books", "mentor"])).toEqual(true);
    });

    it("returns false if any relations are unloaded", async () => {
      await insertAuthor({ first_name: "a" });
      await insertAuthor({ first_name: "b", mentor_id: 1 });
      await insertBook({ author_id: 1, title: "t" });
      const em = newEntityManager();
      const author = await em.load(Author, "2", ["books"]);
      expect(isLoaded(author, ["books", "mentor"])).toEqual(false);
    });
  });

  describe("with an object hint", () => {
    it("returns true if all relations are loaded", async () => {
      await insertAuthor({ first_name: "a" });
      await insertBook({ author_id: 1, title: "t" });
      await insertBookReview({ book_id: 1, rating: 5 });
      await insertComment({ text: "t", parent_book_review_id: 1 });
      const em = newEntityManager();
      const author = await em.load(Author, "1", { books: { reviews: "comment" } });
      expect(isLoaded(author, { books: "reviews" })).toEqual(true);
    });

    it("returns false if any relations are unloaded", async () => {
      await insertAuthor({ first_name: "a" });
      await insertBook({ author_id: 1, title: "t" });
      await insertBookReview({ book_id: 1, rating: 5 });
      const em = newEntityManager();
      const author = await em.load(Author, "1");
      expect(isLoaded(author, { books: "reviews" })).toEqual(false);
    });

    it("returns false if any nested relations are unloaded", async () => {
      await insertAuthor({ first_name: "a" });
      await insertBook({ author_id: 1, title: "t" });
      await insertBookReview({ book_id: 1, rating: 5 });
      const em = newEntityManager();
      const author = await em.load(Author, "1", "books");
      expect(isLoaded(author, { books: "reviews" })).toEqual(false);
    });
  });
});
