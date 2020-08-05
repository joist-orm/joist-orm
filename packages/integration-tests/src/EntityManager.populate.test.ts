import { insertAuthor, insertBook, insertPublisher } from "@src/entities/inserts";
import { Author, Book, Publisher } from "./entities";
import { newEntityManager, numberOfQueries, resetQueryCount } from "./setupDbTests";

describe("EntityManager.populate", () => {
  it("can populate many-to-one", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const booka = await em.load(Book, "1");
    const bookb = await em.populate(booka, "author");
    expect(bookb.author.get.firstName).toEqual("a1");
  });

  it("can populate many-to-one with multiple keys", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const booka = await em.load(Book, "1");
    const bookb = await em.populate(booka, ["author", "tags"]);
    expect(bookb.author.get.firstName).toEqual("a1");
    expect(bookb.tags.get.length).toEqual(0);
  });

  it("can populate many-to-one with nested keys", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const booka = await em.load(Book, "1");
    const bookb = await em.populate(booka, { author: "publisher" });
    expect(bookb.author.get.firstName).toEqual("a1");
    expect(bookb.author.get.publisher.get!.name).toEqual("p1");
  });

  it("can populate one-to-many with nested keys", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    await insertBook({ title: "b3", author_id: 2 });
    await insertBook({ title: "b4", author_id: 2 });
    const em = newEntityManager();

    const asyncPub = await em.load(Publisher, "1");
    resetQueryCount();
    const pub = await em.populate(asyncPub, { authors: "books" });
    expect(numberOfQueries).toEqual(2);
    expect(pub.authors.get.length).toEqual(2);
    expect(pub.authors.get[0].books.get.length).toEqual(2);
    expect(pub.authors.get[1].books.get.length).toEqual(2);
  });

  it("can populate one-to-many with nested keys as an array", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    await insertBook({ title: "b3", author_id: 2 });
    await insertBook({ title: "b4", author_id: 2 });
    const em = newEntityManager();

    const asyncPub = await em.load(Publisher, "1");
    resetQueryCount();
    const pub = await em.populate(asyncPub, { authors: ["books", "publisher"] });
    expect(numberOfQueries).toEqual(2);
    expect(pub.authors.get.length).toEqual(2);
    expect(pub.authors.get[0].books.get.length).toEqual(2);
    expect(pub.authors.get[0].publisher.get!.id).toEqual("p:1");
  });

  it("can populate via load", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "1", ["author", "tags"]);
    expect(book.author.get.firstName).toEqual("a1");
    expect(book.tags.get.length).toEqual(0);
  });

  it("can populate a list", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });

    const em = newEntityManager();
    const _b1 = await em.load(Book, "1");
    const _b2 = await em.load(Book, "1");
    const [b1, b2] = await em.populate([_b1, _b2], "author");
    expect(b1.author.get.firstName).toEqual("a1");
    expect(b2.author.get.firstName).toEqual("a1");
  });

  it("batches across separate populate calls", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });

    const em = newEntityManager();
    const _b1 = await em.load(Book, "1");
    const _b2 = await em.load(Book, "1");
    resetQueryCount();
    const [b1, b2] = await Promise.all([
      //
      em.populate(_b1, "author"),
      em.populate(_b2, "author"),
    ]);
    expect(b1.author.get.firstName).toEqual("a1");
    expect(b2.author.get.firstName).toEqual("a1");
    expect(numberOfQueries).toEqual(1);
  });

  it("can populate from a find call", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });
    const em = newEntityManager();
    resetQueryCount();
    const books = await em.find(Book, {}, { populate: "author" });
    expect(books[0].author.get.firstName).toEqual("a1");
    expect(books[1].author.get.firstName).toEqual("a2");
    expect(numberOfQueries).toEqual(2);
  });

  it("does not break when populating through null relations  ", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1", { publisher: "authors" });
    expect(a1.publisher.get).toBeUndefined();
  });

  it("populate assumes ids are loaded", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "1", "author");
    const authorId: string = book.author.id;
    expect(authorId).toEqual("a:1");
  });

  it("can populate two literals", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1", { publisher: {}, books: { reviews: "book" } } as const);
    expect(a1.publisher.get).toEqual(undefined);
    expect(a1.books.get.flatMap((b) => b.reviews.get)).toEqual([]);
  });
});
