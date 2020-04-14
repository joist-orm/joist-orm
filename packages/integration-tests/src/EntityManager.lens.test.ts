import { EntityManager, Lens } from "joist-orm";
import { knex, numberOfQueries, resetQueryCount } from "./setupDbTests";
import { Book, Publisher } from "./entities";
import { insertAuthor, insertBook, insertPublisher } from "./entities/factories";

describe("EntityManager.lens", () => {
  it("can navigate references", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    const em = new EntityManager(knex);
    const b1 = await em.load(Book, "1");
    const p1 = await b1.load((b) => b.author.publisher);
    expect(p1.name).toEqual("p1");
  });

  it("can navigate with n+1 safe queries", async () => {
    await insertPublisher({ name: "p1" });
    await insertPublisher({ name: "p2" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 2 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });
    const em = new EntityManager(knex);
    const [b1, b2] = await em.find(Book, {});
    resetQueryCount();
    const [p1, p2] = await Promise.all([b1, b2].map((book) => book.load((b) => b.author.publisher)));
    expect(p1.name).toEqual("p1");
    expect(p2.name).toEqual("p2");
    // 2 = 1 for authors, 1 for publishers
    expect(numberOfQueries).toEqual(2);
  });

  it("does not compile if lens is incorrect", async () => {
    // @ts-expect-error
    const f1 = (b: Lens<Book>) => b.author.foo;

    // @ts-expect-error
    const f2 = (b: Lens<Book>) => b.foo;

    // @ts-expect-error
    const f3 = (b: Lens<Book>) => b.title;
  });

  it("can navigate collections", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });
    await insertBook({ title: "b3", author_id: 2 });
    const em = new EntityManager(knex);
    const p1 = await em.load(Publisher, "1");
    resetQueryCount();
    const authors = await p1.load((p) => p.authors);
    expect(authors.length).toEqual(2);
    const books = await p1.load((p) => p.authors.books);
    expect(books.length).toEqual(3);
    expect(numberOfQueries).toEqual(2);
  });

  it("can navigate collections then reference", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 1 });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2 });
    await insertBook({ title: "b3", author_id: 2 });
    const em = new EntityManager(knex);
    const p1 = await em.load(Publisher, "1");
    // This ends in a singular author (which is cyclic, but just b/c our test schema is small, it doesn't matter)
    const authors = await p1.load((p) => p.authors.books.author);
    expect(authors.length).toEqual(2);
  });
});
