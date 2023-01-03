import { insertAuthor, insertBook, insertBookToTag, insertPublisherAsSmall, insertTag } from "@src/entities/inserts";
import { jan1 } from "joist-orm";
import { Author, Book, Publisher, Tag } from "./entities";
import { newEntityManager } from "./setupDbTests";

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

  it("load through o2m skips soft deleted entities", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ author_id: 1, title: "b1", deleted_at: jan1 });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    const books = await author.load((a) => a.books);
    expect(books).toEqual([]);
  });

  it("load through m2o includes soft deleted entities", async () => {
    await insertPublisherAsSmall({ name: "p1" });
    await insertAuthor({ publisher_id: 1, first_name: "a1", deleted_at: jan1 });
    await insertBook({ author_id: 1, title: "b1" });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1");
    expect(await book.load((b) => b.author)).toBeDefined();
    expect(await book.load((b) => b.author.publisher)).toBeDefined();
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
    await insertPublisherAsSmall({ name: "p1" });
    await insertAuthor({ publisher_id: 1, first_name: "a1", deleted_at: jan1 });
    await insertBook({ author_id: 1, title: "b1" });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "p:1", { authors: { books: { comments: {} } } });
    expect(p1.authors.getWithDeleted[0].books.getWithDeleted[0].comments.get.length).toBe(0);
  });
});
