import { EntityManager } from "./EntityManager";
import { Author } from "../integration/Author";
import { knex } from "./setupDbTests";

describe("EntityManager", () => {
  it("can find", async () => {
    // knex("author").insert({ firstName: "f" }).returning("*").;
    await knex.insert({ first_name: "f" }).from("author");

    const em = new EntityManager(knex);
    const authors = await em.find(Author, { id: 1 });
    expect(authors.length).toEqual(1);
  });
});
