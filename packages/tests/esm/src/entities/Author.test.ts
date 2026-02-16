import { afterAll, describe, it } from "@jest/globals";
import { type EntityManagerOpts } from "joist-orm";
import { PostgresDriver } from "joist-orm/pg";
import { newPgConnectionConfig } from "joist-utils";
import pg from "pg";
import { EntityManager, newAuthor } from "./entities.js";

const pool = new pg.Pool(newPgConnectionConfig() as any);

describe("Author", () => {
  it("works", async () => {
    const em = newEntityManager();
    newAuthor(em);
    await em.flush();
  });
});

afterAll(() => {
  return pool.end();
});

export function newEntityManager(): EntityManager {
  const ctx = {};
  const opts: EntityManagerOpts = {
    driver: new PostgresDriver(pool),
  };
  const em = new EntityManager(ctx as any, opts);
  return em;
}
