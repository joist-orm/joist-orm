import {
  countOfAuthors,
  countOfBooks,
  countOfBookToTags,
  countOfTags,
  insertAuthor,
  insertBook,
  insertBookReview,
  insertBookToTag,
  insertImage,
  insertTag,
  select,
} from "@src/entities/inserts";
import { newEntityManager } from "@src/testEm";
import { Author, Book, ImageType } from "./entities";

describe("EntityManager.createOrUpdatePartial", () => {
  it("can create new entity with valid data", async () => {
    const em = newEntityManager();
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a1" });
    expect(a1.firstName).toEqual("a1");
  });

  it("fails to create new entity with invalid data", async () => {
    const em = newEntityManager();
    await em.createOrUpdatePartial(Author, { id: null, firstName: null });
    await expect(em.flush()).rejects.toThrow("firstName is required");
  });

  it("can update an entity with valid data", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.createOrUpdatePartial(Author, { id: "1", firstName: "a2" });
    expect(a1.firstName).toEqual("a2");
  });

  it("fails to update an entity with valid data", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    await em.createOrUpdatePartial(Author, { id: "1", firstName: null });
    await expect(em.flush()).rejects.toThrow("firstName is required");
  });

  describe("m2o", () => {
    it("can create new reference with valid data", async () => {
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, {
        firstName: "a1",
        mentor: { firstName: "m1" },
        // technically testing o2m while we're at it
        books: [{ title: "b1" }],
      });
      expect(a1.firstName).toEqual("a1");
      expect((await a1.mentor.load())!.firstName).toEqual("m1");
      expect((await a1.books.load())![0].title).toEqual("b1");
    });

    it("can update existing references with valid data", async () => {
      await insertAuthor({ first_name: "m1" });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, {
        firstName: "a1",
        mentor: { id: "1", firstName: "m2" },
      });
      expect(a1.firstName).toEqual("a1");
      expect((await a1.mentor.load())!.firstName).toEqual("m2");
      await em.flush();
      expect(await countOfAuthors()).toEqual(2);
    });

    it("can update existing references without an id", async () => {
      await insertAuthor({ first_name: "m1" });
      await insertAuthor({ first_name: "a1", mentor_id: 1 });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, {
        id: "a:2",
        firstName: "a2",
        mentor: { firstName: "m2" },
      });
      expect(a1.firstName).toEqual("a2");
      expect((await a1.mentor.load())!.firstName).toEqual("m2");
      await em.flush();
      expect(await countOfAuthors()).toEqual(2);
    });

    it("can update existing references without an id that is not set", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, {
        id: "a:1",
        firstName: "a2",
        mentor: { firstName: "m2" },
      });
      expect(a1.firstName).toEqual("a2");
      expect((await a1.mentor.load())!.firstName).toEqual("m2");
      await em.flush();
      expect(await countOfAuthors()).toEqual(2);
    });

    it("references can refer to entities by id", async () => {
      await insertAuthor({ first_name: "m1" });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, { firstName: "a1", mentor: "1" });
      expect((await a1.mentor.load())!.firstName).toEqual("m1");
    });

    it("references can refer to entities by id opt", async () => {
      await insertAuthor({ first_name: "m1" });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, { firstName: "a1", mentorId: "1" });
      expect((await a1.mentor.load())!.firstName).toEqual("m1");
    });

    it("references can refer to null", async () => {
      await insertAuthor({ first_name: "m1" });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, { firstName: "a1", mentor: null });
      expect(a1.mentor.isSet).toBe(false);
    });

    it("references can refer to undefined", async () => {
      await insertAuthor({ first_name: "m1" });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, { firstName: "a1", mentor: undefined });
      expect(a1.mentor.isSet).toBe(false);
    });

    it("references can refer to entity", async () => {
      await insertAuthor({ first_name: "m1" });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, { firstName: "a1", mentor: await em.load(Author, "1") });
      expect(a1.mentor.id).toEqual("a:1");
    });
  });

  describe("o2o", () => {
    it("can create new child when creating new parent", async () => {
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, {
        firstName: "a1",
        image: { type: ImageType.AuthorImage },
      });
      expect(a1.firstName).toEqual("a1");
      expect((await a1.image.load())!.type).toEqual(ImageType.AuthorImage);
    });

    it("can find existing child when creating new parent", async () => {
      await insertImage({ type_id: 2, file_name: "author.png" });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, {
        firstName: "a1",
        image: { id: "i:1" },
      });
      expect(a1.firstName).toEqual("a1");
      expect((await a1.image.load())!.type).toEqual(ImageType.AuthorImage);
    });

    it("can be updated", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertImage({ id: 1, type_id: 2, file_name: "author.png", author_id: 1 });
      await insertImage({ id: 2, type_id: 2, file_name: "author.png" });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, {
        id: "a:1",
        image: { id: "i:2" },
      });
      expect((await a1.image.load())!.id).toBe("i:2");
    });

    it("can be unset", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertImage({ id: 1, type_id: 2, file_name: "author.png", author_id: 1 });
      await insertImage({ id: 2, type_id: 2, file_name: "author.png" });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, {
        id: "a:1",
        image: null,
      });
      expect(await a1.image.load()).toBeUndefined();
    });
  });

  describe("o2m", () => {
    it("collections can refer to entities by id", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, { id: "a:1", firstName: "a2", books: ["1"] });
      expect((await a1.books.load())[0].title).toEqual("b1");
    });

    it("collections can refer to entities by id opts", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, { id: "a:1", firstName: "a2", bookIds: ["1"] });
      expect((await a1.books.load())[0].title).toEqual("b1");
    });

    it("collections can refer to null", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, { id: "a:1", firstName: "a2", books: null });
      expect(await a1.books.load()).toEqual([]);
    });

    it("collections can refer to undefined", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, { id: "a:1", firstName: "a2", books: undefined });
      expect(await a1.books.load()).toHaveLength(1);
    });

    it("collections are not upserted", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, {
        id: "a:1",
        // b2 will be added as a new book, and b1 will be orphaned from the author
        books: [{ id: "b:1", delete: true }, { title: "b2" }],
      });
      await em.flush();
      const books = await a1.books.load();
      expect(books.length).toEqual(1);
      const [b2] = books;
      expect(b2.title).toEqual("b2");
    });

    it("collections can delete children with delete flag", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, {
        id: "a:1",
        books: [{ id: "b:1", delete: true }, { id: "b:2" }],
      });
      const loaded = await em.populate(a1, "books");
      // get shows only b1
      expect(loaded.books.get.length).toBe(1);
      // getWithDeleted still shows both b1 and b2
      expect(loaded.books.getWithDeleted.length).toBe(2);
      await em.flush();
      const rows = await select("books");
      expect(rows.length).toEqual(1);
    });

    it("collections can delete children w/o delete flag if they are owned", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBookReview({ book_id: 1, rating: 5 });
      await insertBookReview({ book_id: 1, rating: 5 });
      const em = newEntityManager();
      const b1 = await em.createOrUpdatePartial(Book, {
        id: "b:1",
        reviews: [{ id: "br:2" }],
      });
      const loaded = await em.populate(b1, "reviews");
      // get shows only br1
      expect(loaded.reviews.get.length).toBe(1);
      // getWithDeleted still shows both b1 and b2
      expect(loaded.reviews.getWithDeleted.length).toBe(2);
      await em.flush();
      const rows = await select("book_reviews");
      expect(rows.length).toEqual(1);
    });

    it("collections wont delete children when delete is false", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertBook({ title: "b2", author_id: 1 });
      const em = newEntityManager();
      await em.createOrUpdatePartial(Author, {
        id: "a:1",
        books: [{ id: "b:1", title: "b1changed", delete: false }, { id: "b:2" }],
      });
      await em.flush();
      expect(await countOfBooks()).toEqual(2);
      const b1 = await em.load(Book, "b:1");
      expect(b1.title).toEqual("b1changed");
    });

    it("collections can remove children", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertTag({ name: "t1" });
      await insertTag({ name: "t2" });
      await insertBookToTag({ tag_id: 1, book_id: 1 });
      await insertBookToTag({ tag_id: 2, book_id: 1 });
      const em = newEntityManager();
      await em.createOrUpdatePartial(Book, { id: "b:1", tags: [{ id: "t:2", remove: true }] });
      await em.flush();
      expect(await countOfTags()).toEqual(2);
      expect(await countOfBookToTags()).toEqual(0);
    });

    it("collections can incrementally remove children", async () => {
      // Given a book with two tags
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertTag({ name: "t1" });
      await insertTag({ name: "t2" });
      await insertBookToTag({ tag_id: 1, book_id: 1 });
      await insertBookToTag({ tag_id: 2, book_id: 1 });
      const em = newEntityManager();
      // When we incrementally remove a single tag
      const b = await em.createOrUpdatePartial(Book, { id: "b:1", tags: [{ id: "t:2", op: "remove" }] });
      await em.flush();
      // Then we removed only that one m2m row
      expect((await b.tags.load()).map((t) => t.id)).toEqual(["t:1"]);
      // And we still have both tags
      expect(await countOfTags()).toEqual(2);
    });

    it("collections can incrementally delete children", async () => {
      // Given a book with two tag
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertTag({ name: "t1" });
      await insertTag({ name: "t2" });
      await insertBookToTag({ tag_id: 1, book_id: 1 });
      await insertBookToTag({ tag_id: 2, book_id: 1 });
      const em = newEntityManager();
      // When we incrementally delete a single tag
      const b = await em.createOrUpdatePartial(Book, { id: "b:1", tags: [{ id: "t:2", op: "delete" }] });
      await em.flush();
      // Then we removed only that one m2m row
      expect((await b.tags.load()).map((t) => t.id)).toEqual(["t:1"]);
      // And we also deleted its entity
      expect(await countOfBookToTags()).toEqual(1);
    });

    it("collections can incrementally add children", async () => {
      // Given a book with one tag
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertTag({ name: "t1" });
      await insertTag({ name: "t2" });
      await insertBookToTag({ tag_id: 1, book_id: 1 });
      const em = newEntityManager();
      // When we incrementally add a single tag
      await em.createOrUpdatePartial(Book, { id: "b:1", tags: [{ id: "t:2", op: "include" }] });
      await em.flush();
      // Then we have both m2m rows
      expect(await countOfBookToTags()).toEqual(2);
    });

    it("collections can incrementally not clear collections by seeing a marker", async () => {
      // Given a book with one tag
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      await insertTag({ name: "t1" });
      await insertBookToTag({ tag_id: 1, book_id: 1 });
      const em = newEntityManager();
      // When we incrementally "set" tags to empty
      await em.createOrUpdatePartial(Book, { id: "b:1", tags: [{ op: "incremental" }] });
      await em.flush();
      // Then we have the m2m row
      expect(await countOfBookToTags()).toEqual(1);
    });

    it("collections can refer to entities", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertBook({ title: "b1", author_id: 1 });
      const em = newEntityManager();
      const a1 = await em.createOrUpdatePartial(Author, { firstName: "a2", books: [await em.load(Book, "1")] });
      expect((await a1.books.load())[0].title).toEqual("b1");
    });
  });

  describe("m2m", () => {
    it("rejects invalid ids", async () => {
      const em = newEntityManager();
      const result = em.createOrUpdatePartial(Author, {
        tags: ["", ""],
      });
      await expect(result).rejects.toThrow("Invalid Tag id: ");
    });
  });

  it("createOrUpdatePartial doesnt allow unknown fields to be passed", async () => {
    const em = newEntityManager();
    // Given an opt `publisherTypo` (instead of `publisher`) that don't match exactly what Author supports
    await expect(async () => {
      // Then we get a compile error
      // @ts-expect-error
      await em.createOrUpdatePartial(Author, { firstName: "a2", publisherTypo: "1" });
    }).rejects.toThrow("Unknown field publisherTypo");
  });

  it("createPartial doesnt allow unknown fields to be passed", async () => {
    const em = newEntityManager();
    // Given an opt `publisherId` (instead of `publisher`) that don't match exactly what Author supports
    await expect(async () => {
      // Then we get a compile error
      // @ts-expect-error
      await em.createPartial(Author, { firstName: "a2", publisherId: "1" });
    }).rejects.toThrow("Unknown field publisherId");
  });

  it("can create new entity with non-field properties", async () => {
    const em = newEntityManager();
    const a1 = await em.createOrUpdatePartial(Author, { fullName: "a1 l1" } as any);
    expect(a1.firstName).toEqual("a1");
    expect(a1.lastName).toEqual("l1");
  });

  it("can create new entity with non-field setter-only properties", async () => {
    const em = newEntityManager();
    const a1 = await em.createOrUpdatePartial(Author, { fullName2: "a1 l1" } as any);
    expect(a1.firstName).toEqual("a1");
    expect(a1.lastName).toEqual("l1");
  });
});
