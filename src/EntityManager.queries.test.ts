import { EntityManager } from "./EntityManager";
import { Author } from "../integration/Author";
import { knex, numberOfQueries, resetQueryCount } from "./setupDbTests";

describe("EntityManager", () => {
  it("can find all authors", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ first_name: "a2" }).from("authors");
    const em = new EntityManager(knex);
    const authors = await em.find(Author, {});
    expect(authors.length).toEqual(2);
  });
});
