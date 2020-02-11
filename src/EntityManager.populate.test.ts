import { knex } from "./setupDbTests";
import { EntityManager } from "./EntityManager";
import { Book } from "../integration/Book";

describe("EntityManager", () => {
  it("can populate many-to-one", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ title: "b1", author_id: 1 }).from("books");
    const em = new EntityManager(knex);
    const booka = await em.load(Book, "1");
    const bookb = await em.populate(booka, "author");
    expect(bookb.author.get().firstName).toEqual("a1");
  });

  it("can populate many-to-one with multiple keys", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ title: "b1", author_id: 1 }).from("books");
    const em = new EntityManager(knex);
    const booka = await em.load(Book, "1");
    const bookb = await em.populate(booka, ["author", "tags"]);
    expect(bookb.author.get().firstName).toEqual("a1");
    expect(bookb.tags.get().length).toEqual(0);
  });

  it("can populate many-to-one with nested keys", async () => {
    await knex.insert({ name: "p1" }).from("publishers");
    await knex.insert({ first_name: "a1", publisher_id: 1 }).from("authors");
    await knex.insert({ title: "b1", author_id: 1 }).from("books");
    const em = new EntityManager(knex);
    const booka = await em.load(Book, "1");
    const bookb = await em.populate(booka, { author: "publisher" } as const);
    expect(bookb.author.get().firstName).toEqual("a1");
    expect(bookb.author.get().publisher.get().name).toEqual("p1");
  });
});
