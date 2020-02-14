import { knex, numberOfQueries, resetQueryCount } from "./setupDbTests";
import { EntityManager } from "./EntityManager";
import { Book, Publisher } from "../integration";

describe("EntityManager.populate", () => {
  it("can populate many-to-one", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ title: "b1", author_id: 1 }).from("books");
    const em = new EntityManager(knex);
    const booka = await em.load(Book, "1");
    const bookb = await em.populate(booka, "author");
    expect(bookb.author.get.firstName).toEqual("a1");
  });

  it("can populate many-to-one with multiple keys", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ title: "b1", author_id: 1 }).from("books");
    const em = new EntityManager(knex);
    const booka = await em.load(Book, "1");
    const bookb = await em.populate(booka, ["author", "tags"]);
    expect(bookb.author.get.firstName).toEqual("a1");
    expect(bookb.tags.get.length).toEqual(0);
  });

  it("can populate many-to-one with nested keys", async () => {
    await knex.insert({ name: "p1" }).from("publishers");
    await knex.insert({ first_name: "a1", publisher_id: 1 }).from("authors");
    await knex.insert({ title: "b1", author_id: 1 }).from("books");
    const em = new EntityManager(knex);
    const booka = await em.load(Book, "1");
    const bookb = await em.populate(booka, { author: "publisher" } as const);
    expect(bookb.author.get.firstName).toEqual("a1");
    expect(bookb.author.get.publisher.get.name).toEqual("p1");
  });

  it("can populate one-to-many with nested keys", async () => {
    await knex.insert({ name: "p1" }).from("publishers");
    await knex.insert({ first_name: "a1", publisher_id: 1 }).from("authors");
    await knex.insert({ first_name: "a1", publisher_id: 1 }).from("authors");
    await knex.insert({ title: "b1", author_id: 1 }).from("books");
    await knex.insert({ title: "b2", author_id: 1 }).from("books");
    await knex.insert({ title: "b3", author_id: 2 }).from("books");
    await knex.insert({ title: "b4", author_id: 2 }).from("books");
    const em = new EntityManager(knex);

    const asyncPub = await em.load(Publisher, "1");
    resetQueryCount();
    const pub = await em.populate(asyncPub, { authors: "books" } as const);
    expect(numberOfQueries).toEqual(2);
    expect(pub.authors.get.length).toEqual(2);
    expect(pub.authors.get[0].books.get.length).toEqual(2);
    expect(pub.authors.get[1].books.get.length).toEqual(2);
  });

  it("can populate via load", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ title: "b1", author_id: 1 }).from("books");
    const em = new EntityManager(knex);
    const book = await em.load(Book, "1", ["author", "tags"]);
    expect(book.author.get.firstName).toEqual("a1");
    expect(book.tags.get.length).toEqual(0);
  });

  it("can populate a list", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ title: "b1", author_id: 1 }).from("books");
    await knex.insert({ title: "b2", author_id: 1 }).from("books");

    const em = new EntityManager(knex);
    const _b1 = await em.load(Book, "1");
    const _b2 = await em.load(Book, "1");
    const [b1, b2] = await em.populate([_b1, _b2], "author");
    expect(b1.author.get.firstName).toEqual("a1");
    expect(b2.author.get.firstName).toEqual("a1");
  });

  it("batches across separate populate calls", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ title: "b1", author_id: 1 }).from("books");
    await knex.insert({ title: "b2", author_id: 1 }).from("books");

    const em = new EntityManager(knex);
    const _b1 = await em.load(Book, "1");
    const _b2 = await em.load(Book, "1");
    resetQueryCount();
    const [b1, b2] = await Promise.all([em.populate(_b1, "author"), em.populate(_b2, "author")]);
    expect(b1.author.get.firstName).toEqual("a1");
    expect(b2.author.get.firstName).toEqual("a1");
    expect(numberOfQueries).toEqual(1);
  });
});
