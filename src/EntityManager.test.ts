import { EntityManager } from "./EntityManager";
import { Author } from "../integration/Author";
import { knex } from "./setupDbTests";

describe("EntityManager", () => {
  it("can find", async () => {
    await knex.insert({ first_name: "f" }).from("author");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, { id: 1 });
    expect(authors.length).toEqual(1);
    expect(authors[0].firstName).toEqual("f");
  });
});
