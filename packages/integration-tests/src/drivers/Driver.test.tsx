import { Author, Book, newBook, newTag, Tag } from "@src/entities";
import { insertAuthor, insertBook, insertBookToTag, insertImage, insertTag, select } from "@src/entities/inserts";
import { driver, newEntityManager } from "@src/setupDbTests";
import { getMetadata, setField } from "joist-orm";

// This will test whatever driver the test suite is currently being run against
describe("Driver", () => {
  describe("flushEntities", () => {
    it("can insert", async () => {
      const em = newEntityManager();
      const author = new Author(em, { firstName: "a1" });
      // Pretend EntityManager.flush ran
      setField(author, "initials", "a");
      setField(author, "numberOfBooks", 0);
      await em.driver.flushEntities(em, {
        Author: {
          metadata: getMetadata(Author),
          inserts: [author],
          deletes: [],
          updates: [],
          validates: new Map(),
          asyncFields: new Map(),
        },
      });
      const authors = await select("authors");
      expect(authors.length).toEqual(1);
      expect(authors[0].id).toEqual(1);
      expect(authors[0].first_name).toEqual("a1");
      expect(authors[0].graduated).toEqual(null);
    });

    // This is currently not passing in the main pg driver tests due to an op-lock error
    it.skip("can update", async () => {
      const jan1 = new Date(2000, 0, 1);
      await insertAuthor({ first_name: "a1", updated_at: jan1 });

      const em = newEntityManager();
      const author = new Author(em, { firstName: "a1" });
      author.__orm.data.updated_at = jan1;
      author.__orm.data.id = "a:1";
      author.firstName = "changed";
      await em.driver.flushEntities(em, {
        Author: {
          metadata: getMetadata(Author),
          inserts: [],
          deletes: [],
          updates: [author],
          validates: new Map(),
          asyncFields: new Map(),
        },
      });

      const authors = await select("authors");
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
      const rows = await select("books_to_tags");
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
      const rows = await select("books_to_tags");
      expect(rows).toMatchObject([]);
    });

    it("can remove unloaded rows", async () => {
      // Given an existing books_to_tags
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
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
      const rows = await select("books_to_tags");
      expect(rows).toMatchObject([]);
    });
  });

  it("can loadManyToMany", async () => {
    // Given a book with two tags
    await insertAuthor({ first_name: "a1" });
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
