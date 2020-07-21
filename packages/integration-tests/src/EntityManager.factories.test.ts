import {
  AdvanceStatus,
  Author,
  Book,
  newAuthor,
  newBook,
  newBookAdvance,
  newPublisher,
  Publisher,
  Tag,
} from "@src/entities";
import { EntityManager, New } from "joist-orm";
import { knex } from "./setupDbTests";

describe("EntityManager.factories", () => {
  it("can create a single top-level entity", async () => {
    const em = new EntityManager(knex);
    // Given a simple entity that has no required parents/children
    const p1 = newPublisher(em);
    await em.flush();
    // Then we create only that entity
    expect(p1.name).toEqual("name");
    expect(em.numberOfEntities).toEqual(1);
  });

  it("can create a child and a required parent", async () => {
    const em = new EntityManager(knex);
    // Given we make a book with no existing/passed authors
    const b1 = newBook(em);
    await em.flush();
    // Then we create the author b/c it's required
    expect(b1.author.get.firstName).toEqual("a1");
  });

  it("can create a child and a required parent if opt is undefined", async () => {
    const em = new EntityManager(knex);
    // Given we make a book with no existing/passed authors
    const b1 = newBook(em, { author: undefined });
    await em.flush();
    // Then we create the author b/c it's required
    expect(b1.author.get.firstName).toEqual("a1");
  });

  it("can create a child and a required parent with opts", async () => {
    const em = new EntityManager(knex);
    // Given we make a book with no existing/passed authors
    const b1 = newBook(em, { author: { firstName: "long name" } });
    await em.flush();
    // Then we create the author b/c it's required
    expect(b1.author.get.firstName).toEqual("long name");
  });

  it("can create a child and use an existing parent from opt", async () => {
    const em = new EntityManager(knex);
    // Given there is an existing author
    const a1 = newAuthor(em);
    // When we explicitly pass it as an opt
    const b1 = newBook(em, { author: a1 });
    await em.flush();
    // Then it is used
    expect(b1.author.get).toEqual(a1);
  });

  it("can create a child and use an existing parent from EntityManager", async () => {
    const em = new EntityManager(knex);
    // Given there is only a single author
    const a1 = newAuthor(em);
    // When we make a book and don't specify the author
    const b1 = newBook(em);
    await em.flush();
    // Then the first author was chosen
    expect(b1.author.get).toEqual(a1);
  });

  it("can create a child and create a new parent if already many existing", async () => {
    const em = new EntityManager(knex);
    // Given there are already several authors
    const a1 = newAuthor(em);
    const a2 = newAuthor(em);
    // When we make a book and don't specify the author
    const b1 = newBook(em);
    await em.flush();
    // Then it got a new author
    expect(b1.author.get).not.toEqual(a1);
    expect(b1.author.get).not.toEqual(a2);
    expect(b1.author.get.firstName).toEqual("a3");
  });

  it("can create a grandchild and specify the grandparent", async () => {
    const em = new EntityManager(knex);
    // Given there are multiple existing publishers
    const p1 = newPublisher(em);
    newPublisher(em);
    // When we make a book and pass along the specific publisher p1
    const b1 = newBook(em, { use: p1 });
    await em.flush();
    // Then we create a new author
    const a1 = b1.author.get as New<Author>;
    expect(a1.firstName).toEqual("a1");
    // And it has the publisher set
    expect(a1.publisher.get).toEqual(p1);
  });

  it("can create a grandchild and specify the grandparents opts", async () => {
    const em = new EntityManager(knex);
    // When we make a book and have opts for the grandparent
    const b1 = newBook(em, { author: { publisher: { name: "p1" } } });
    await em.flush();
    // Then we create a new author
    const a1 = b1.author.get as New<Author>;
    expect(a1.firstName).toEqual("a1");
    // And we create a new publisher
    const p1 = a1.publisher.get as New<Publisher>;
    expect(p1.name).toEqual("p1");
  });

  it("can create a parent and child with opts", async () => {
    const em = new EntityManager(knex);
    // Given we make a new parent + two children
    const a1 = newAuthor(em, { books: [{ title: "b1" }, {}] });
    await em.flush();
    // Then we have the 1st book
    const b1 = a1.books.get[0] as New<Book>;
    expect(b1.title).toEqual("b1");
    expect(b1.author.get).toEqual(a1);
    // And the 2nd book
    const b2 = a1.books.get[1] as New<Book>;
    expect(b2.title).toEqual("title");
    expect(b2.author.get).toEqual(a1);
    // And we didn't create an extra author
    expect(em.numberOfEntities).toEqual(3);
  });

  it("can default a required enum", async () => {
    const em = new EntityManager(knex);
    // Given we make a book advance
    const ba = newBookAdvance(em);
    // Then the status field is set to the 1st enum value
    expect(ba.status).toEqual(AdvanceStatus.Pending);
  });

  it("can tweak opts in the factory", async () => {
    const em = new EntityManager(knex);
    const a = newAuthor(em, { isPopular: true });
    expect(a.age).toEqual(50);
  });

  it("can completely customize opts in the factory", async () => {
    const em = new EntityManager(knex);
    const b = newBook(em, { tags: [1, 2] });
    const tags = b.tags.get as New<Tag>[];
    expect(tags[0].name).toEqual("1");
    expect(tags[1].name).toEqual("2");
  });

  it("cannot pass invalid customized opts", async () => {
    const em = new EntityManager(knex);
    // @ts-expect-error
    newBook(em, { tags: [{ name: "t1" }] });
  });

  it("can use tagged ids as shortcuts", async () => {
    const em = new EntityManager(knex);
    const a1 = newAuthor(em);
    const b1 = newBook(em, { author: "a:1" });
    expect(b1.author.get).toEqual(a1);
  });

  it("can use tagged ids as shortcuts in list", async () => {
    const em = new EntityManager(knex);
    const a1 = newAuthor(em);
    const p1 = newPublisher(em, { authors: ["a:1"] });
    expect(p1.authors.get).toEqual([a1]);
  });

  it("can omit default values for non-required primitive fields", async () => {
    const em = new EntityManager(knex);
    const a1 = newAuthor(em);
    expect(a1.firstName).toEqual("a1");
    expect(a1.lastName).toBeUndefined();
  });
});
