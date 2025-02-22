import {
  countOfBookToTags,
  insertAuthor,
  insertBook,
  insertBookToTag,
  insertPublisher,
  insertTag,
  select,
} from "@src/entities/inserts";
import { newEntityManager, numberOfQueries, resetQueryCount } from "@src/testEm";
import { Author, Book, Tag, newAuthor, newBook, newBookReview, newSmallPublisher, newTag, newUser } from "../entities";
import { zeroTo } from "../utils";

describe("ManyToManyCollection", () => {
  it("can load a many-to-many", async () => {
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: "t1" });
    await insertBookToTag({ id: 4, book_id: 2, tag_id: 3 });

    const em = newEntityManager();
    const book = await em.load(Book, "2");
    const tags = await book.tags.load();
    expect(tags.length).toEqual(1);
    expect(tags[0].name).toEqual("t1");
  });

  it("can load both sides of many-to-many", async () => {
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: "t1" });
    await insertBookToTag({ id: 4, book_id: 2, tag_id: 3 });

    const em = newEntityManager();
    const book = await em.load(Book, "2", "tags");
    const tag = await em.load(Tag, "3", "books");
    expect(book.tags.get.length).toEqual(1);
    expect(tag.books.get.length).toEqual(1);
    expect(book.tags.get[0]).toStrictEqual(tag);
    expect(tag.books.get[0]).toStrictEqual(book);
    expect((em as any).__api.joinRows({ joinTableName: "books_to_tags" }).rows.length).toEqual(1);
  });

  it("can load a many-to-many with constant queries", async () => {
    // Given a book has 5 tags
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await Promise.all(zeroTo(5).map((i) => insertTag({ name: `t${i}` })));
    await Promise.all(zeroTo(5).map((i) => insertBookToTag({ book_id: 1, tag_id: i + 1 })));

    const em = newEntityManager();
    const book = await em.load(Book, "1");
    resetQueryCount();
    const tags = await book.tags.load();
    expect(tags.length).toEqual(5);
    // 1 query to the join table, and 1 query to the tags table
    expect(numberOfQueries).toEqual(2);
  });

  it("can load both sides of a many-to-many with constant queries", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    // Given a book has 5 tags
    await Promise.all(zeroTo(5).map((i) => insertTag({ name: `t${i}` })));
    await Promise.all(zeroTo(5).map((i) => insertBookToTag({ book_id: 1, tag_id: i + 1 })));
    // And the 1st tag itself has two more books
    await Promise.all(zeroTo(2).map((i) => insertBook({ title: `b${i + 1}`, author_id: 1 })));
    await Promise.all(zeroTo(2).map((i) => insertBookToTag({ book_id: i + 2, tag_id: 1 })));

    const em = newEntityManager();
    const book = await em.load(Book, "1");
    const tag = await em.load(Tag, "1");
    resetQueryCount();
    const [b1Tags, t1Books] = await Promise.all([book.tags.load(), tag.books.load()]);
    expect(b1Tags.length).toEqual(5);
    expect(t1Books.length).toEqual(3);
    // 1 query to the join table, 1 query to the tags table (for t2-5), and 1 query to the books table (for b2-3)
    expect(numberOfQueries).toEqual(3);
  });

  it("can add an existing tag to an existing book", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: `t1` });
    const em = newEntityManager();
    const book = await em.load(Book, "2");
    const tag = await em.load(Tag, "3");

    // Spam adding/removing to repro a bug that only happened after 3x add/removes
    book.tags.add(tag);
    book.tags.remove(tag);
    book.tags.add(tag);
    book.tags.remove(tag);
    book.tags.add(tag);

    await em.flush();
    const rows = await select("books_to_tags");
    expect(rows[0]).toEqual(expect.objectContaining({ id: 1, book_id: 2, tag_id: 3 }));
  });

  it("can add an existing tag to an existing book and then load", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: `t1` });
    const em = newEntityManager();
    const book = await em.load(Book, "2");
    const tag = await em.load(Tag, "3");
    book.tags.add(tag);
    expect(await book.tags.load()).toMatchEntity([tag]);
  });

  it("can add a new tag tag to a new book", async () => {
    const em = newEntityManager();
    const book = newBook(em);
    const tag = newTag(em, 1);

    // Spam adding/removing to repro a bug that only happened after 3x add/removes
    book.tags.add(tag);
    expect(book.tags.get).toMatchEntity([tag]);
    expect(tag.books.get).toMatchEntity([book]);
    book.tags.remove(tag);
    expect(book.tags.get).toMatchEntity([]);
    expect(tag.books.get).toMatchEntity([]);

    book.tags.add(tag);
    expect(book.tags.get).toMatchEntity([tag]);
    expect(tag.books.get).toMatchEntity([book]);
    book.tags.remove(tag);
    expect(book.tags.get).toMatchEntity([]);
    expect(tag.books.get).toMatchEntity([]);

    book.tags.add(tag);
    expect(book.tags.get).toMatchEntity([tag]);
    expect(tag.books.get).toMatchEntity([book]);

    await em.flush();
    const rows = await select("books_to_tags");
    expect(rows[0]).toEqual(expect.objectContaining({ id: 1, book_id: 1, tag_id: 1 }));
  });

  it("can add existing tag-to-book m2m rows without failing", async () => {
    await insertAuthor({ first_name: "a1" });
    // Given two books/two tags, and 1 book->tag each
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertBook({ id: 3, title: "b2", author_id: 1 });
    await insertTag({ id: 4, name: `t1` });
    await insertTag({ id: 5, name: `t2` });
    await insertBookToTag({ book_id: 2, tag_id: 4 });
    await insertBookToTag({ book_id: 3, tag_id: 5 });

    const em = newEntityManager();
    const [b2, b3] = await em.loadAll(Book, ["b:2", "b:3"]);
    const [t4, t5] = await em.loadAll(Tag, ["t:4", "t:5"]);

    // When we add the existing relations again
    b2.tags.add(t4);
    t5.books.add(b3);
    // And also add new m2ms
    b2.tags.add(t5);
    t4.books.add(b3);
    await em.flush();

    // Then both the old and new m2ms exist
    let rows = await select("books_to_tags");
    expect(rows).toMatchObject([
      { book_id: 2, tag_id: 4 },
      { book_id: 3, tag_id: 5 },
      { book_id: 2, tag_id: 5 },
      { book_id: 3, tag_id: 4 },
    ]);

    // And if we then remove all of those rows
    b2.tags.remove(t4);
    t5.books.remove(b3);
    b2.tags.remove(t5);
    t4.books.remove(b3);
    await em.flush();

    // Then there are none left
    rows = await select("books_to_tags");
    expect(rows).toMatchObject([]);
  });

  it("cannot add undefined", async () => {
    const em = newEntityManager();
    const book = newBook(em);
    expect(() => {
      book.set({ tags: [undefined as any] });
    }).toThrow("Cannot add a m2m row with an entity that is undefined");
  });

  it("can get on a pending delete entity", async () => {
    // Not being able to m2m.get on a pending delete entity caused a flakey test
    // due to a CustomReference checking .isLoaded which wanted to check that a
    // pending-delete entity included in the CustomReference's sub-graph was loaded.
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: "t1" });
    await insertBookToTag({ id: 4, book_id: 2, tag_id: 3 });

    const em = newEntityManager();
    const book = await em.load(Book, "2", "tags");
    em.delete(book);
    expect(book.tags.get.length).toBe(1);
  });

  it("can add a new book to a tag", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: `t1` });

    const em = newEntityManager();
    const book = await em.load(Book, "2");
    const tag = await em.load(Tag, "3");

    tag.books.add(book);
    await em.flush();

    const rows = await select("books_to_tags");
    expect(rows[0]).toEqual(expect.objectContaining({ id: 1, book_id: 2, tag_id: 3 }));
  });

  it("can add a new tag to a new book", async () => {
    const em = newEntityManager();
    const author = em.create(Author, { firstName: "a1" });
    const book = em.create(Book, { title: "b1", author });
    const tag = em.create(Tag, { name: "t3" });

    book.author.set(author);
    book.tags.add(tag);
    expect(tag.books.get).toContain(book);

    await em.flush();

    expect(await countOfBookToTags()).toEqual(1);
  });

  it("can add a new 2nd tag to a existing book", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertTag({ name: "t1" });
    await insertBookToTag({ book_id: 1, tag_id: 1 });

    const em = newEntityManager();
    const book = await em.load(Book, "b:1");
    const tag = em.create(Tag, { name: "t2" });

    book.tags.add(tag);
    expect(tag.books.get).toContain(book);
    expect((await book.tags.load()).length).toBe(2);
    await em.flush();

    expect(await countOfBookToTags()).toEqual(2);
  });

  it("can remove a tag from a book", async () => {
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: `t1` });
    await insertTag({ id: 4, name: `t2` });
    await insertBookToTag({ book_id: 2, tag_id: 3 });
    await insertBookToTag({ book_id: 2, tag_id: 4 });

    const em = newEntityManager();
    const book = await em.load(Book, "2", "tags");
    const tag = await em.load(Tag, "3");
    book.tags.remove(tag);
    expect(book.tags.get.length).toEqual(1);
    await em.flush();

    const rows = await select("books_to_tags");
    expect(rows.length).toEqual(1);
  });

  it("can remove a tag from a book before being loaded", async () => {
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: `t1` });
    await insertTag({ id: 4, name: `t2` });
    await insertBookToTag({ book_id: 2, tag_id: 3 });
    await insertBookToTag({ book_id: 2, tag_id: 4 });

    const em = newEntityManager();
    const book = await em.load(Book, "2");
    const tag = await em.load(Tag, "3");
    // When the tag is removed before book.tags is loaded
    book.tags.remove(tag);
    // And book.tags is loaded
    const tags = await book.tags.load();
    // Then the removed tag is still not present
    expect(tags.length).toEqual(1);
    expect(tags[0].name).toEqual("t2");
    await em.flush();

    expect(await countOfBookToTags()).toEqual(1);
  });

  it("can remove a tag from a book without ever being loaded", async () => {
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: `t1` });
    await insertTag({ id: 4, name: `t2` });
    await insertBookToTag({ book_id: 2, tag_id: 3 });
    await insertBookToTag({ book_id: 2, tag_id: 4 });

    const em = newEntityManager();
    const book = await em.load(Book, "2");
    const tag = await em.load(Tag, "3");
    // When the tag is removed when book.tags is unloaded
    book.tags.remove(tag);
    await em.flush();

    expect(await countOfBookToTags()).toEqual(1);
  });

  it("can delete a tag that is on a book", async () => {
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: `t1` });
    await insertTag({ id: 4, name: `t2` });
    await insertBookToTag({ book_id: 2, tag_id: 3 });
    await insertBookToTag({ book_id: 2, tag_id: 4 });
    // Given a book with two tags
    const em = newEntityManager();
    const b1 = await em.load(Book, "2", "tags");
    const t1 = await em.load(Tag, "3");
    const t2 = await em.load(Tag, "4");
    // When the tag is deleted
    em.delete(t1);
    await em.flush();
    // Then the deleted tag is removed from the book collection
    expect(b1.tags.get.map((t) => t.id)).toEqual([t2.id]);
    // And the tag itself was deleted
    expect((await select("tags")).length).toEqual(1);
    // And the join table entry was deleted
    expect((await select("books_to_tags")).length).toEqual(1);
  });

  it("can delete a tag that is on a book with an RQF loop", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ id: 1, first_name: "a1", publisher_id: 1 });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: `t1` });
    await insertTag({ id: 4, name: `t2` });
    await insertBookToTag({ book_id: 2, tag_id: 3 });
    await insertBookToTag({ book_id: 2, tag_id: 4 });
    // Given a book with two tags
    const em = newEntityManager();
    const b1 = await em.load(Book, "2", "tags");
    const t1 = await em.load(Tag, "3");
    const t2 = await em.load(Tag, "4");
    // When the tag is deleted
    em.delete(t1);
    // ...and we also recalc a RFQ
    newBookReview(em, { book: "b:1" });
    await em.flush();
    // Then the deleted tag is removed from the book collection
    expect(b1.tags.get.map((t) => t.id)).toEqual([t2.id]);
    // And the tag itself was deleted
    expect((await select("tags")).length).toEqual(1);
    // And the join table entry was deleted
    expect((await select("books_to_tags")).length).toEqual(1);
  });

  it("can delete multiple tags on a book", async () => {
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: `t1` });
    await insertTag({ id: 4, name: `t2` });
    await insertBookToTag({ book_id: 2, tag_id: 3 });
    await insertBookToTag({ book_id: 2, tag_id: 4 });
    // Given a book with two tags
    const em = newEntityManager();
    const b1 = await em.load(Book, "2", "tags");
    const t1 = await em.load(Tag, "3");
    const t2 = await em.load(Tag, "4");
    // When both tags are deleted
    em.delete(t1);
    em.delete(t2);
    await em.flush();
    // Then the deleted tag is removed from the book collection
    expect(b1.tags.get.length).toEqual(0);
    // And the join table rows were deleted
    expect((await select("books_to_tags")).length).toEqual(0);
  });

  it("can remove a newly-added tag that was added to a new entity", async () => {
    await insertTag({ id: 1, name: `t1` });
    // Given we create a new book
    const em = newEntityManager();
    const b1 = newBook(em);
    const t1 = await em.load(Tag, "1");
    // And add-then-remove the tag
    b1.tags.add(t1);
    b1.tags.remove(t1);
    // And the book itself is pruned
    em.delete(b1);
    await em.flush();
  });

  it("cannot add to a deleted entity's m2m", async () => {
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: "t1" });
    // Given a book with two tags
    const em = newEntityManager();
    const b1 = await em.load(Book, "2");
    const t1 = await em.load(Tag, "3");
    // And the book is deleted
    em.delete(b1);
    // Then we cannot add to the tags collection
    expect(() => b1.tags.add(t1)).toThrow("Book:2 is marked as deleted");
  });

  it("cannot remove to a deleted entity's m2m", async () => {
    await insertAuthor({ id: 1, first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: "t1" });
    // Given a book with two tags
    const em = newEntityManager();
    const b1 = await em.load(Book, "2");
    const t1 = await em.load(Tag, "3");
    // And the book is deleted
    em.delete(b1);
    await em.flush();
    // Then we cannot remove from the tags collection
    expect(() => b1.tags.remove(t1)).toThrow("Book:2 is marked as deleted");
  });

  it("can set to both add and remove", async () => {
    // Given the book already has t1 and t2 on it
    await insertAuthor({ first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: `t1` });
    await insertTag({ id: 4, name: `t2` });
    await insertTag({ id: 5, name: `t3` });
    await insertBookToTag({ book_id: 2, tag_id: 3 });
    await insertBookToTag({ book_id: 2, tag_id: 4 });

    // When we set t2 and t3
    const em = newEntityManager();
    const book = await em.load(Book, "2", "tags");
    const [t2, t3] = await em.loadAll(Tag, ["4", "5"]);
    book.tags.set([t2, t3]);
    await em.flush();

    // Then we removed t1, left t2, and added t3
    const rows = await select("books_to_tags");
    expect(rows.length).toEqual(2);
    expect(rows[0]).toEqual(expect.objectContaining({ book_id: 2, tag_id: 4 }));
    expect(rows[1]).toEqual(expect.objectContaining({ book_id: 2, tag_id: 5 }));
  });

  it("can setPartial when initially unloaded", async () => {
    // Given the book already has t3 and t4 on it
    await insertAuthor({ first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: `t3` });
    await insertTag({ id: 4, name: `t4` });
    await insertTag({ id: 5, name: `t5` });
    await insertBookToTag({ book_id: 2, tag_id: 3 });
    await insertBookToTag({ book_id: 2, tag_id: 4 });

    // When we setPartial t4 and t5
    const em = newEntityManager();
    const book = await em.load(Book, "b:2");
    const [t4, t5] = await em.loadAll(Tag, ["t:4", "t:5"]);
    await em.createOrUpdatePartial(Book, { id: book.id, tags: [t4, t5] });
    await em.flush();

    // We could recognize when M2M.set is called w/o a load, and issue a DELETE + INSERTs.
  });

  it("can include on a new entity", async () => {
    // Given a tag
    const em = newEntityManager();
    await insertTag({ name: `t1` });
    const tag = await em.load(Tag, "t:1");
    resetQueryCount();
    // And a new book
    const book = newBook(em);
    // When we ask the book if it has the tag
    const includes = await book.tags.includes(tag);
    // Then it does not
    expect(includes).toBe(false);
    // And we did not need to make a query
    expect(numberOfQueries).toEqual(0);
  });

  it("can include on a new other entity", async () => {
    // Given a tag
    const em = newEntityManager();
    await insertTag({ name: `t1` });
    const tag = await em.load(Tag, "t:1");
    resetQueryCount();
    // And a new book
    const book = newBook(em);
    // When we ask the tag if it has the book
    const includes = await tag.books.includes(book);
    // Then it does not
    expect(includes).toBe(false);
    // And we did not need to make a query
    expect(numberOfQueries).toEqual(0);
  });

  it("can include on existing entities", async () => {
    // Given lots of tags and book
    const em = newEntityManager();
    await insertTag({ name: "t1" });
    await insertTag({ name: "t2" });
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1" });
    await insertBookToTag({ book_id: 1, tag_id: 1 });
    const t1 = await em.load(Tag, "t:1");
    const t2 = await em.load(Tag, "t:2");
    const book = await em.load(Book, "b:1");
    resetQueryCount();
    // When we ask each other if they include each other
    const p1 = t1.books.includes(book);
    const p2 = t2.books.includes(book);
    const p3 = book.tags.includes(t1);
    const p4 = book.tags.includes(t2);
    const [includes1, includes2, includes3, includes4] = await Promise.all([p1, p2, p3, p4]);
    // Then they do
    expect(includes1).toBe(true);
    expect(includes2).toBe(false);
    expect(includes3).toBe(true);
    expect(includes4).toBe(false);
    // And we used only a single query
    expect(numberOfQueries).toEqual(1);
    // And we did not load the other tags
    expect(em.entities.length).toEqual(3);
    // And if we redo a .includes
    const includes1_2 = await t1.books.includes(book);
    // Then it was cached
    expect(includes1_2).toBe(true);
    expect(numberOfQueries).toEqual(1);
  });

  it("can include just added entities on new entities", async () => {
    // Given a new book and tag
    const em = newEntityManager();
    const book = newBook(em);
    const tag = newTag(em, 1);
    // And we've added them together in-memory
    book.tags.add(tag);
    // Then we can answer includes
    const p1 = tag.books.includes(book);
    const p2 = book.tags.includes(tag);
    const [includes1, includes2] = await Promise.all([p1, p2]);
    expect(includes1).toBe(true);
    expect(includes2).toBe(true);
    // And we did not make any db queries
    expect(numberOfQueries).toEqual(0);
  });

  it("can include just added entities on existing entities", async () => {
    // Given an existing book and tag
    const em = newEntityManager();
    await insertTag({ name: "t1" });
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1" });
    resetQueryCount();
    const book = await em.load(Book, "b:1");
    const tag = await em.load(Tag, "t:1");
    // And we've added them together in-memory
    book.tags.add(tag);
    // Then we can answer includes
    const p1 = tag.books.includes(book);
    const p2 = book.tags.includes(tag);
    const [includes1, includes2] = await Promise.all([p1, p2]);
    expect(includes1).toBe(true);
    expect(includes2).toBe(true);
  });

  it("can forceReload a new many-to-many that is empty", async () => {
    const em = newEntityManager();
    const author = newAuthor(em);
    const book = new Book(em, { title: "b1", author });
    const loaded = await book.populate({ hint: "tags", forceReload: true });
    expect(loaded.tags.get.length).toBe(0);
  });

  it("can forceReload a new many-to-many that is not empty", async () => {
    const em = newEntityManager();
    const author = newAuthor(em);
    const t1 = newTag(em, { name: "t1" });
    const book = new Book(em, { title: "b1", author, tags: [t1] });
    const loaded = await book.populate({ hint: "tags", forceReload: true });
    expect(loaded.tags.get.length).toBe(1);
  });

  it("can be renamed", () => {
    // see createManyToManyTable("users_to_comments",...) in 1580658856631_author.ts for the actual rename
    const em = newEntityManager();
    const user = newUser(em);
    expect((user as any).comments).not.toBeDefined();
    expect(user.likedComments).toBeDefined();
  });

  describe("touchOnChange", () => {
    it("detects adds m2m - using factories", async () => {
      const em = newEntityManager();
      const book = newBook(em, { title: "To be changed by hook" });
      const t1 = newTag(em, { name: "t1" });
      await em.flush();

      book.tags.add(t1);
      await em.flush();
      expect(book.tags.get).toHaveLength(1);
      // this test assumes there is a hook that fires when the tags collection is modified, that sets the title of the book to "Tags Changed"
      expect(book.title).toBe("Tags Changed");
      // and another on the tags to change the tag name
      expect(t1.name).toBe("Books Changed");
      // and we expect the state of the join rows to be clear after the flush but keep the relation loaded
      const joinRows = (em as any).__api.joinRows({ joinTableName: "books_to_tags" });
      expect(joinRows.hasChanges).toBe(false);
      expect(joinRows.rows.length).toEqual(1);
    });

    it("detects adds m2m - using insert and loads", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ id: 2, title: "To be changed by hook", author_id: 1 });
      await insertTag({ id: 3, name: "t1" });
      const em = newEntityManager();
      const book = await em.load(Book, "2");
      const tag = await em.load(Tag, "3");

      book.tags.add(tag);
      await em.flush();

      // this test assumes there is a hook that fires when the tags collection is modified, that sets the title of the book to "Tags Changed"
      expect(book.title).toBe("Tags Changed");
      // and another on the tags to change the tag name
      expect(tag.name).toBe("Books Changed");
      // and we expect the state of the join rows to be clear after the flush but keep the relation loaded
      const joinRows = (em as any).__api.joinRows({ joinTableName: "books_to_tags" });
      expect(joinRows.hasChanges).toBe(false);
      expect(joinRows.rows.length).toEqual(1);
    });

    it("detects remove m2m - using insert and loads", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ id: 2, title: "To be changed by hook 1", author_id: 1 });
      await insertBook({ id: 3, title: "To be changed by hook 2", author_id: 1 });
      await insertTag({ id: 4, name: "t1" });
      await insertBookToTag({ id: 5, book_id: 2, tag_id: 4 });
      await insertBookToTag({ id: 6, book_id: 3, tag_id: 4 });
      const em = newEntityManager();
      const book = await em.load(Book, "2");
      const tag = await em.load(Tag, "4");

      book.tags.remove(tag);
      await em.flush();

      // this test assumes there is a hook that fires when the tags collection is modified, that sets the title of the book to "Tags Changed"
      expect(book.title).toBe("Tags Changed");
      // and another on the tags to change the tag name
      expect(tag.name).toBe("Books Changed");
      // and we expect the state of the join rows to be clear after the flush but keep the relation loaded
      const joinRows = (em as any).__api.joinRows({ joinTableName: "books_to_tags" });
      expect(joinRows.hasChanges).toBe(false);
      expect(joinRows.rows.length).toEqual(2);
    });

    it("detects adds m2m - until afterCommit", async () => {
      const em = newEntityManager();
      const book = newBook(em, { title: "To be changed by hook" });
      const t1 = newTag(em, { name: "t1" });
      await em.flush();
      expect(book.afterCommitCheckTagsChanged).toBe(undefined);
      // When we set the m2m relation
      book.tags.add(t1);
      await em.flush();
      // Then we observed `book.changes.fields` had tags in it
      expect(book.afterCommitCheckTagsChanged).toBe(true);
    });

    it("detects adds m2m on subtypes", async () => {
      const em = newEntityManager();
      const sp = newSmallPublisher(em);
      const t1 = newTag(em, { name: "t1" });
      await em.flush();
      sp.beforeFlushRan = false;
      // When we set the m2m relation
      sp.tags.add(t1);
      await em.flush();
      expect(sp.beforeFlushRan).toBe(true);
    });
  });
});
