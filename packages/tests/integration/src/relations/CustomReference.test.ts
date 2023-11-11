import { insertAuthor, insertBook, insertBookReview, insertImage, select } from "@src/entities/inserts";
import { Author, Book, BookReview, Image, ImageType } from "../entities";

import { newEntityManager } from "@src/testEm";

describe("CustomReference", () => {
  it("can load a reference", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertImage({ type_id: 2, file_name: "i1", author_id: 1 });

    const em = newEntityManager();
    const i1 = await em.load(Image, "1");
    const a2 = await i1.owner.load();
    expect((a2 as Author).firstName).toEqual("a1");
  });

  it("can populate a reference", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertImage({ type_id: 2, file_name: "i1", author_id: 1 });

    const em = newEntityManager();
    const image = await em.load(Image, "1", "owner");
    expect((image.owner.get as Author).firstName).toEqual("a1");
  });

  it("does not cache the reference value", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertImage({ type_id: 2, file_name: "f1", author_id: 1 });

    const em = newEntityManager();
    const [a1, a2] = await em.loadAll(Author, ["1", "2"]);
    const i1 = await em.load(Image, "1", "owner");
    expect(i1.owner.get).toEqual(a1);
    i1.author.set(a2);
    expect(i1.owner.get).toEqual(a2);
  });

  it("can set a reference", async () => {
    const em = newEntityManager();
    const image = em.create(Image, { type: ImageType.AuthorImage, fileName: "f1" });
    const author = em.create(Author, { firstName: "a1" });
    image.owner.set(author);
    await em.flush();

    const rows = await select("images");
    expect(rows[0].author_id).toEqual(1);
  });

  it("can set changes to a loaded reference", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertImage({ type_id: 2, file_name: "f1", author_id: 1 });

    const em = newEntityManager();
    const a2 = await em.load(Author, "2");
    const i1 = await em.load(Image, "1", "owner");
    i1.owner.set(a2);
    await em.flush();

    const rows = await select("images");
    expect(rows[0].author_id).toEqual(2);
  });

  it("cannot set changes to a unloaded reference", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ rating: 5, book_id: 1 });

    const em = newEntityManager();
    const a2 = await em.load(Author, "2");
    const r1 = await em.load(BookReview, "1");

    expect(() => r1.author.set(a2)).toThrow("BookReview:1.author was not loaded");
  });

  it("can load against a new entity", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "1");
    const review = em.createPartial(BookReview, { book, rating: 5 });
    const author = await review.author.load();
    expect(author.firstName).toEqual("a1");
  });
});
