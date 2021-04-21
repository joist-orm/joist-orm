import {
  countOfAuthors,
  countOfBooks,
  countOfBookToTags,
  countOfTags,
  insertAuthor,
  insertBook,
  insertBookToTag,
  insertTag,
} from "@src/entities/inserts";
import { Author, Book } from "./entities";
import { knex, newEntityManager } from "./setupDbTests";

describe("EntityManager", () => {
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

  it("can create new children with valid data", async () => {
    const em = newEntityManager();
    const a1 = await em.createOrUpdatePartial(Author, {
      firstName: "a1",
      mentor: { firstName: "m1" },
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
    expect(a1.mentor.isSet).toBeFalsy();
  });

  it("references can refer to undefined", async () => {
    await insertAuthor({ first_name: "m1" });
    const em = newEntityManager();
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a1", mentor: undefined });
    expect(a1.mentor.isSet).toBeFalsy();
  });

  it("references can refer to entity", async () => {
    await insertAuthor({ first_name: "m1" });
    const em = newEntityManager();
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a1", mentor: await em.load(Author, "1") });
    expect(a1.mentor.id).toEqual("a:1");
  });

  it("collections can refer to entities by id", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a2", books: ["1"] });
    expect((await a1.books.load())[0].title).toEqual("b1");
  });

  it("collections can refer to entities by id opts", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a2", bookIds: ["1"] });
    expect((await a1.books.load())[0].title).toEqual("b1");
  });

  it("collections can refer to null", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a2", books: null });
    expect(await a1.books.load()).toEqual([]);
  });

  it("collections can refer to undefined", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a2", books: undefined });
    expect(await a1.books.load()).toEqual([]);
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

  it("collections can delete children", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    const em = newEntityManager();
    await em.createOrUpdatePartial(Author, { id: "a:1", books: [{ id: "b:1", delete: true }, { id: "b:2" }] });
    await em.flush();
    const rows = await knex.select("*").from("books");
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

  it("collections can refer to entities", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const a1 = await em.createOrUpdatePartial(Author, { firstName: "a2", books: [await em.load(Book, "1")] });
    expect((await a1.books.load())[0].title).toEqual("b1");
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
});
