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

  it("can populate via promise on direct load", async () => {
    // Given a book with an author and no tags
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });

    // When we load and then populate author and tags
    const em = newEntityManager();
    const book = await em.load(Book, "1").populate(["author", "tags"]);

    // we can access author and tags but no tags will be present
    expect(book.author.get.idOrFail).toEqual("a:1");
    expect(book.tags.get.length).toEqual(0);
  });

  it("can propagate undefined through a populate promise", async () => {
    // Given an author with no publisher
    await insertAuthor({ first_name: "a1" });

    // When we load the author then try to load and populate through publisher
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    const publisher = await author.publisher.load().populate("images");

    // we can access author and tags but no tags will be present
    expect(publisher).toBeUndefined();
  });

  it("can propagate an empty array through a populate promise", async () => {
    // Given an author with no books
    await insertAuthor({ first_name: "a1" });

    // When we load the author then try to load and populate through publisher
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    const books = await author.books.load().populate("image");

    // we can access author and tags but no tags will be present
    expect(books).toEqual([]);
  });

  it("can populate via promise for an array of entities", async () => {
    // Given a publisher with 2 authors, each with a book
    await insertPublisher({ id: 1, name: "p1" });
    await insertAuthor({ id: 1, first_name: "a1", publisher_id: 1 });
    await insertAuthor({ id: 2, first_name: "a2", publisher_id: 1 });
    await insertBook({ id: 1, title: "b1", author_id: 1 });
    await insertBook({ id: 2, title: "b2", author_id: 2 });

    // When we get the publisher
    const em = newEntityManager();
    const publisher = await em.load(Publisher, "p:1");
    // then load its authors and populate their books
    const [a1, a2] = await publisher.authors.load().populate("books");

    // We can directly access each author's books
    expect(a1.books.get.map((b) => b.idOrFail)).toEqual(["b:1"]);
    expect(a2.books.get.map((b) => b.idOrFail)).toEqual(["b:2"]);
  });

  it("can populate via promise for a single entity", async () => {
    // Given a book that belongs to an author which in turn belongs to a publisher
    await insertPublisher({ id: 1, name: "p1" });
    await insertAuthor({ id: 1, first_name: "a1", publisher_id: 1 });
    await insertBook({ id: 1, title: "b1", author_id: 1 });

    // When we get the book
    const em = newEntityManager();
    const book = await em.load(Book, "b:1");
    // then load its author and populate its publisher
    const author = await book.author.load().populate("publisher");

    // We can directly access the author's publisher
    expect(author.publisher.get?.idOrFail).toEqual("p:1");
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
    const a1 = await em.load(Author, "1", { publisher: {}, books: { reviews: "book" } });
    expect(a1.publisher.get).toEqual(undefined);
    expect(a1.books.get.flatMap((b) => b.reviews.get)).toEqual([]);
  });
});
