import { Author, Book, newBook, newTag, Publisher, Tag } from "@src/entities";
import {
  insertAuthor,
  insertBook,
  insertBookToTag,
  insertImage,
  insertPublisher,
  insertTag,
} from "@src/entities/inserts-memory";
import { driver, newEntityManager } from "@src/setupMemoryTests";
import { getMetadata } from "joist-orm";

describe("InMemoryDriver", () => {
  describe("flushEntities", () => {
    it("can insert", async () => {
      const em = newEntityManager();
      await em.driver.flushEntities(em, {
        Author: {
          metadata: getMetadata(Author),
          inserts: [new Author(em, { firstName: "a1" })],
          deletes: [],
          updates: [],
          validates: [],
        },
      });
      const authors = driver.select("authors");
      expect(authors.length).toEqual(1);
      expect(authors[0].id).toEqual(1);
      expect(authors[0].first_name).toEqual("a1");
      expect(authors[0].graduated).toEqual(null);
    });

    it("can update", async () => {
      await insertAuthor({ first_name: "a1" });

      const em = newEntityManager();
      const author = new Author(em, { firstName: "a1" });
      author.__orm.data.id = "a:1";
      author.firstName = "changed";
      await em.driver.flushEntities(em, {
        Author: {
          metadata: getMetadata(Author),
          inserts: [],
          deletes: [],
          updates: [author],
          validates: [],
        },
      });

      const authors = driver.select("authors");
      expect(authors.length).toEqual(1);
      expect(authors[0].id).toEqual(1);
      expect(authors[0].first_name).toEqual("changed");
    });
  });

  describe("flushJoinTables", () => {
    it("can add rows", async () => {
      const em = newEntityManager();
      const b1 = newBook(em);
      const t1 = newTag(em, 1);
      b1.tags.add(t1);
      await em.flush();
      const rows = driver.select("books_to_tags");
      expect(rows).toMatchObject([{ id: 1, book_id: 1, tag_id: 1 }]);
    });

    it("can remove loaded rows", async () => {
      const em = newEntityManager();
      const b1 = newBook(em);
      const t1 = newTag(em, 1);
      b1.tags.add(t1);
      await em.flush();
      b1.tags.remove(t1);
      await em.flush();
      const rows = driver.select("books_to_tags");
      expect(rows).toMatchObject([]);
    });

    it("can remove unloaded rows", async () => {
      // Given an existing books_to_tags
      await insertBook({ title: "b1", author_id: 0 });
      await insertTag({ name: "t1 " });
      await insertBookToTag({ book_id: 1, tag_id: 1 });
      // And we load the book & tag
      const em = newEntityManager();
      const b1 = await em.load(Book, "b:1");
      const t1 = await em.load(Tag, "t:1");
      // And we remove t1 against the unloaded collection
      b1.tags.remove(t1);
      // When we flush
      await em.flush();
      // Then the row is deleted
      const rows = driver.select("books_to_tags");
      expect(rows).toMatchObject([]);
    });
  });

  it("can loadOneToMany", async () => {
    // Given a publisher with two authors
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 1 });
    // And we create a dummy publisher to get the authors
    const em = newEntityManager();
    const p2 = em.create(Publisher, { name: "p2" });
    // Purposefully using the non-dummy id 1
    const rows = await driver.loadOneToMany(em, p2.authors as any, ["1"]);
    expect(rows.length).toEqual(2);
  });

  it("can loadManyToMany", async () => {
    // Given a book with two tags
    await insertBook({ title: "b1", author_id: 1 });
    await insertTag({ name: "t1" });
    await insertTag({ name: "t2" });
    await insertBookToTag({ book_id: 1, tag_id: 1 });
    await insertBookToTag({ book_id: 1, tag_id: 2 });
    // And we create a dummy book to get the tags collection
    const em = newEntityManager();
    const b2 = em.create(Book, { title: "b2", author: undefined! });
    // Purposefully using the non-dummy id 1
    const rows = await driver.loadManyToMany(em, b2.tags as any, ["book_id=b:1"]);
    expect(rows.length).toEqual(2);
  });

  it("can loadOneToOne", async () => {
    // Given an author with an image
    await insertAuthor({ first_name: "a1" });
    await insertImage({ file_name: "f1", type_id: 2, author_id: 1 });
    // And we create a dummy author to get the image reference
    const em = newEntityManager();
    const a2 = em.create(Author, { firstName: "a2" });
    // Purposefully using the non-dummy id 1
    const rows = (await driver.loadOneToOne(em, a2.image as any, ["1"])) as any;
    expect(rows[0].file_name).toEqual("f1");
  });
});
