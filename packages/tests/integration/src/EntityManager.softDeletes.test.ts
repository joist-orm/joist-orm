import { insertAuthor, insertBook, insertBookToTag, insertPublisher, insertTag, update } from "@src/entities/inserts";
import { Author, Book, Publisher, Tag } from "./entities";
import { jan1 } from "./testDates";

import { newEntityManager } from "@src/testEm";

describe("EntityManager.softDeletes", () => {
  it("o2m.get skips soft deleted entities", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1", deleted_at: jan1 });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1", "books");
    expect(author.books.get).toEqual([]);
    expect(author.books.getWithDeleted).toMatchEntity([{ title: "b1" }]);
  });

  it("m2o.get includes deleted entities", async () => {
    await insertAuthor({ first_name: "a1", deleted_at: jan1 });
    await insertBook({ author_id: 1, title: "b1" });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1", "author");
    expect(book.author.get).toMatchEntity({ firstName: "a1" });
    expect(book.author.getWithDeleted).toMatchEntity({ firstName: "a1" });
  });

  it("o2o.get includes deleted entities", async () => {
    await insertAuthor({ first_name: "a1", deleted_at: jan1 });
    await insertBook({ author_id: 1, title: "b1" });
    await update("authors", { id: 1, favorite_book_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1", "favoriteAuthor");
    expect(book.favoriteAuthor.get).toMatchEntity({ firstName: "a1" });
  });

  it("o2o.load includes deleted entities", async () => {
    await insertAuthor({ first_name: "a1", deleted_at: jan1 });
    await insertBook({ author_id: 1, title: "b1" });
    await update("authors", { id: 1, favorite_book_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1");
    expect(await book.favoriteAuthor.load()).toMatchEntity({ firstName: "a1" });
  });

  it("m2m.get skips soft deleted entities", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1, deleted_at: jan1 });
    await insertTag({ name: "t1" });
    await insertBookToTag({ book_id: 1, tag_id: 1 });
    const em = newEntityManager();
    const tag = await em.load(Tag, "t:1", "books");
    expect(tag.books.get).toEqual([]);
    expect(tag.books.getWithDeleted).toMatchEntity([{ title: "b1" }]);
  });

  it("o2m.load can return soft deleted entities", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1", deleted_at: jan1 });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    expect(await author.books.load()).toMatchEntity([]);
    expect(await author.books.load({ withDeleted: true })).toMatchEntity([{ title: "b1" }]);
  });

  it("m2m.load can return soft deleted entities", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1, deleted_at: jan1 });
    await insertTag({ name: "t1" });
    await insertBookToTag({ book_id: 1, tag_id: 1 });
    const em = newEntityManager();
    const tag = await em.load(Tag, "t:1");
    expect(await tag.books.load()).toMatchEntity([]);
    expect(await tag.books.load({ withDeleted: true })).toMatchEntity([{ title: "b1" }]);
  });

  it("load through o2m skips soft deleted entities", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1", deleted_at: jan1 });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    const books = await author.load((a) => a.books);
    expect(books).toEqual([]);
  });

  it("em.load includes soft deleted entities", async () => {
    await insertAuthor({ first_name: "a1", deleted_at: jan1 });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    expect(author).toMatchEntity({ firstName: "a1" });
  });

  it("em.loadAll includes soft deleted entities", async () => {
    await insertAuthor({ first_name: "a1", deleted_at: jan1 });
    const em = newEntityManager();
    expect(await em.loadAll(Author, ["a:1"])).toMatchEntity([{ firstName: "a1" }]);
  });

  it("load through m2o includes soft deleted entities", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ publisher_id: 1, first_name: "a1", deleted_at: jan1 });
    await insertBook({ author_id: 1, title: "b1" });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1");
    expect(await book.load((b) => b.author)).toBeDefined();
    expect(await book.load((b) => b.author.publisher)).toBeDefined();
  });

  it("find with populate includes soft deleted m2o references", async () => {
    await insertAuthor({ first_name: "a1", deleted_at: jan1 });
    await insertBook({ author_id: 1, title: "b1" });
    const em = newEntityManager();
    const books = await em.find(Book, { title: "b1" }, { populate: "author" });
    expect(books).toMatchEntity([{ title: "b1", author: { firstName: "a1" } }]);
  });

  it("load transitively through m2o skips soft deleted entities", async () => {
    await insertAuthor({ first_name: "a1", deleted_at: jan1 });
    await insertBook({ author_id: 1, title: "b1" });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1");
    const books = await book.load((b) => b.author.books);
    expect(books).toEqual([]);
  });

  it("populates soft-deleted entities", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ publisher_id: 1, first_name: "a1", deleted_at: jan1 });
    await insertBook({ author_id: 1, title: "b1" });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "p:1", { authors: { books: { comments: {} } } });
    expect(p1.authors.getWithDeleted[0].books.getWithDeleted[0].comments.get.length).toBe(0);
  });

  it("find ignores soft-deleted entities in middle of o2m join", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ publisher_id: 1, first_name: "a1", deleted_at: jan1 });
    await insertBook({ author_id: 1, title: "b1" });
    const em = newEntityManager();
    const publishers = await em.find(Publisher, { authors: { books: { title: "b1" } } });
    expect(publishers.length).toBe(0);
  });

  it("find ignores soft-deleted entities at start of query", async () => {
    await insertAuthor({ first_name: "a1", deleted_at: jan1 });
    const em = newEntityManager();
    const authors = await em.find(Author, { firstName: "a1" });
    expect(authors.length).toBe(0);
  });

  it("find ignores soft-deleted entities at end of m2o join", async () => {
    await insertAuthor({ first_name: "a1", deleted_at: jan1 });
    await insertBook({ author_id: 1, title: "b1" });
    const em = newEntityManager();
    const books = await em.find(Book, { author: { firstName: "a1" } });
    expect(books.length).toBe(0);
  });

  it("find ignores soft-deleted entities at end of m2o without join", async () => {
    await insertAuthor({ first_name: "a1", deleted_at: jan1 });
    await insertBook({ author_id: 1, title: "b1" });
    const em = newEntityManager();
    const books = await em.find(Book, { author: "a:1" });
    expect(books.length).toBe(0);
  });

  it("find can return soft-deleted entities", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ publisher_id: 1, first_name: "a1", deleted_at: jan1 });
    await insertBook({ author_id: 1, title: "b1" });
    const em = newEntityManager();
    const publishers = await em.find(Publisher, { authors: { books: { title: "b1" } } }, { softDeletes: "include" });
    expect(publishers.length).toBe(1);
  });

  it("findByUnique filters soft deleted entities unless included", async () => {
    await insertAuthor({ first_name: "a1", ssn: "ssn1", deleted_at: jan1 });
    const em = newEntityManager();
    expect(await em.findByUnique(Author, { ssn: "ssn1" })).toBeUndefined();
    expect(await em.findByUnique(Author, { ssn: "ssn1" }, { softDeletes: "include" })).toMatchEntity({
      firstName: "a1",
    });
  });

  it("findCount filters soft deleted entities unless included", async () => {
    await insertAuthor({ first_name: "a1", deleted_at: jan1 });
    const em = newEntityManager();
    expect(await em.findCount(Author, { firstName: "a1" })).toEqual(0);
    expect(await em.findCount(Author, { firstName: "a1" }, { softDeletes: "include" })).toEqual(1);
  });

  it("findIds filters soft deleted entities unless included", async () => {
    await insertAuthor({ first_name: "a1", deleted_at: jan1 });
    const em = newEntityManager();
    expect(await em.findIds(Author, { firstName: "a1" })).toEqual([]);
    expect(await em.findIds(Author, { firstName: "a1" }, { softDeletes: "include" })).toEqual(["a:1"]);
  });
});
