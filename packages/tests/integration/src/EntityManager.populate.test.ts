import { insertAuthor, insertBook, insertPublisher } from "@src/entities/inserts";
import { setDefaultEntityLimit } from "joist-orm";
import { Author, Book, Publisher, newAuthor, newBook, newPublisher } from "./entities";

import { isPreloadingEnabled, newEntityManager, numberOfQueries, resetQueryCount } from "@src/testEm";

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
    expect(numberOfQueries).toEqual(isPreloadingEnabled ? 1 : 2);
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
    expect(numberOfQueries).toEqual(isPreloadingEnabled ? 1 : 2);
    expect(pub.authors.get.length).toEqual(2);
    expect(pub.authors.get[0].books.get.length).toEqual(2);
    expect(pub.authors.get[0].publisher.get!.id).toEqual("p:1");
  });

  it("can populate one-to-many when filtering on a o2o", async () => {
    const em = newEntityManager();
    // The userOneToOne will do a `left outer join` from `authors` -> `users`,
    // which usually we do for "the author has lots of children" and so throw on
    // a `distinct`. However, because we know this is an o2o, we can still do the
    // `left outer join` to handle the conditional-ness of the o2o, but we don't
    // need a distinct. ...and the distinct breaks the aggregation approach.
    //
    // Maybe we need to revisit the splitter approach to avoid distincts...
    // https://github.com/stephenh/joist-ts/pull/835
    await em.find(Author, { userOneToOne: "u:1" }, { populate: { comments: "user" } });
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
    expect(numberOfQueries).toEqual(isPreloadingEnabled ? 1 : 2);
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

  it("can take a function when calling Entity.populate", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "1");
    const result = await book.populate(["author", "tags"], (book) => [book.author.get.firstName, book.tags.get.length]);
    expect(result).toEqual(["a1", 0]);
  });

  it("can take a function when calling EntityManager.populate", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const book = await em.load(Book, "1");
    const result = await em.populate(book, ["author", "tags"], (book) => [
      book.author.get.firstName,
      book.tags.get.length,
    ]);
    expect(result).toEqual(["a1", 0]);
  });

  it.skip("can be huge", async () => {
    jest.setTimeout(1_000_000);
    setDefaultEntityLimit(100_000);
    const em1 = newEntityManager();
    // Create 10,000 entities
    for (let i = 0; i < 10; i++) {
      const p = newPublisher(em1);
      for (let j = 0; j < 10; j++) {
        const a = newAuthor(em1, { publisher: p });
        for (let k = 0; k < 100; k++) {
          newBook(em1, { author: a });
        }
      }
    }
    await em1.flush();
    // console.log({ em1: em1.populates });
    // Now call a single populate
    const em2 = newEntityManager();
    const publishers = await em2.find(Publisher, {});
    await em2.populate(publishers, { authors: { books: { author: "publisher" } } });
    // console.log({ em2: em2.populates });
  });

  it("can re-populate nested keys after changes", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });

    const em = newEntityManager();
    // Given we populate w/one author+book
    const p1 = await em.load(Publisher, "p:1");
    const loaded = await p1.populate({ authors: "books" });
    expect(loaded.authors.get[0].books.get.length).toBe(1);
    // When we also add author2 to the same publisher
    const a2 = await em.load(Author, "a:2");
    p1.authors.add(a2);
    // And we call populate again
    await p1.populate({ authors: "books" });
    // Then a2.books was loaded
    expect(loaded.authors.get[1].books.get.length).toBe(1);
  });

  it("gives a helpful error for invalid hints", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    const em = newEntityManager();
    // @ts-expect-error
    const p = em.load(Author, "a:1", { publisher: "size" });
    await expect(p).rejects.toThrow("Invalid load hint 'size' on SmallPublisher:1");
  });
});
