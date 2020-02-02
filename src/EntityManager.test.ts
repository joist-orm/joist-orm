import Knex from "knex";

describe("EntityManager", () => {
  it("can find", async () => {
    const knex = Knex({
      client: "pg",
      connection: {
        host: "127.0.0.1",
        port: 5434,
        user: "joist",
        password: "local",
        database: "joist",
      },
    });

    try {
      // knex("author").insert({ firstName: "f" }).returning("*").;
      const l = await knex.insert({ first_name: "f" }).from("author");
      console.log(l);

      const em = (undefined as any) as EntityManager;
      const authors = em.find(Author, { id: 1 });
      expect(authors.length).toEqual(1);
    } finally {
      await knex.destroy();
    }
  });
});
