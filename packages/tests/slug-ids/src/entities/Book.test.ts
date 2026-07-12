import { deTagId, getMetadata, tagId } from "joist-orm";
import { Book, newBook } from "src/entities";
import { insertAuthor, insertBook } from "src/entities/inserts";
import { newEntityManager, select } from "src/setupDbTests";

describe("slug id relations", () => {
  it("round trips slug ids through relations", async () => {
    const em1 = newEntityManager();
    const b1 = newBook(em1, { title: "b1", author: { firstName: "a1" } });
    await em1.flush();

    expect(b1.id).toEqual("book1");
    expect(b1.author.id).toEqual("a1");
    expect(await select("books")).toMatchObject([{ id: "1", author_id: 1 }]);

    const em2 = newEntityManager();
    const loaded = await em2.load(Book, "book1", "author");
    expect(loaded.id).toEqual("book1");
    expect(loaded.author.get.id).toEqual("a1");
  });

  it("preserves bigint precision", async () => {
    const id = "9007199254740993";
    const meta = getMetadata(Book);
    await insertAuthor({ first_name: "a1" });
    await insertBook({ id, title: "b1", author_id: 1 });
    const em = newEntityManager();

    expect(tagId(meta, id)).toEqual(`book${id}`);
    expect(deTagId(meta, `book${id}`)).toEqual(id);
    expect((await em.load(Book, id)).id).toEqual(`book${id}`);
  });
});
