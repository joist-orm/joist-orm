import { insertAuthor, insertBook, insertBookToTag, insertTag } from "@src/entities/inserts";
import { jan1 } from "joist-orm";
import { Author, Book, Tag } from "./entities";
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

  it("m2o.get skips soft deleted entities", async () => {
    await insertAuthor({ first_name: "a1", deleted_at: jan1 });
    await insertBook({ author_id: 1, title: "b1" });
    const em = newEntityManager();
    const book = await em.load(Book, "b:1", "author");
    expect(book.author.get).toEqual(undefined);
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
});
