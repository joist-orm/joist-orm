import { countOfBookToTags, insertAuthor, insertBook, insertBookToTag, insertTag } from "@src/entities/inserts";
import { Author, Book, Tag } from "../entities";
import { knex, newEntityManager, numberOfQueries, resetQueryCount } from "../setupDbTests";
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
    expect(em.__data.joinRows["books_to_tags"].length).toEqual(1);
  });

  it("can load a many-to-many with constant queries", async () => {
    // Given a book has 5 tags
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await Promise.all(
      zeroTo(5).map(async (i) => {
        await insertTag({ name: `t${i}` });
        await insertBookToTag({ book_id: 1, tag_id: i + 1 });
      }),
    );

    const em = newEntityManager();
    const book = await em.load(Book, "1");
    resetQueryCount();
    const tags = await book.tags.load();
    expect(tags.length).toEqual(5);
    // 1 query to the join table, and 1 query to the tags table
    expect(numberOfQueries).toEqual(2);
  });

  it("can load both sides of a many-to-many with constant queries", async () => {
    // Given a book has 5 tags
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await Promise.all(
      zeroTo(5).map(async (i) => {
        await insertTag({ name: `t${i}` });
        await insertBookToTag({ book_id: 1, tag_id: i + 1 });
      }),
    );
    // And the 1st tag itself has two more books
    await Promise.all(
      zeroTo(2).map(async (i) => {
        await insertBook({ title: `b${i + 1}`, author_id: 1 });
        await insertBookToTag({ book_id: i + 2, tag_id: 1 });
      }),
    );

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

  it("can add a new tag to a book", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    await insertTag({ id: 3, name: `t1` });

    const em = newEntityManager();
    const book = await em.load(Book, "2");
    const tag = await em.load(Tag, "3");

    book.tags.add(tag);
    await em.flush();

    const rows = await knex.select("*").from("books_to_tags");
    expect(rows[0]).toEqual(expect.objectContaining({ id: 1, book_id: 2, tag_id: 3 }));
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

    const rows = await knex.select("*").from("books_to_tags");
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

    const rows = await knex.select("*").from("books_to_tags");
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
    expect((await knex.select("*").from("tags")).length).toEqual(1);
    // And the join table entry was deleted
    expect((await knex.select("*").from("books_to_tags")).length).toEqual(1);
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
    expect((await knex.select("*").from("books_to_tags")).length).toEqual(0);
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
    const rows = await knex.select("*").from("books_to_tags").orderBy("id");
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
    await em.createOrUpdatePartial(Book, { id: book.idOrFail, tags: [t4, t5] });
    await em.flush();

    // We could recognize when M2M.set is called w/o a load, and issue a DELETE + INSERTs.
  });
});
