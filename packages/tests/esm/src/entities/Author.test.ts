import { afterAll, describe, it } from "@jest/globals";
import { type EntityManagerOpts } from "joist-orm";
import { PostgresDriver } from "joist-orm/pg";
import { newPgConnectionConfig } from "joist-utils";
import knexModule from "knex";
import { EntityManager, newAuthor } from "./entities.js";

const knex = knexModule({
  client: "pg",
  connection: newPgConnectionConfig() as any,
  debug: false,
  asyncStackTraces: true,
});

describe("Author", () => {
  it("works", async () => {
    const em = newEntityManager();
    newAuthor(em);
    await em.flush();
  });
});

afterAll(() => {
  return knex.destroy();
});

export function newEntityManager(): EntityManager {
  const ctx = { knex };
  const opts: EntityManagerOpts = {
    driver: new PostgresDriver(knex),
  };
  const em = new EntityManager(ctx as any, opts);
  return em;
}
