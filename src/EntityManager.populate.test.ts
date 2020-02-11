import { knex, numberOfQueries, resetQueryCount } from "./setupDbTests";
import { EntityManager } from "./EntityManager";
import { Book } from "../integration/Book";
import { Publisher } from "../integration/Publisher";

describe("EntityManager", () => {
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
});
