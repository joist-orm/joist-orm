import { afterAll, describe, it } from "@jest/globals";
import { type EntityManagerOpts, PostgresDriver } from "joist-orm";
import { newPgConnectionConfig } from "joist-utils";
import postgres from "postgres";
import { EntityManager, newAuthor } from "./entities.ts";

const sql = postgres(newPgConnectionConfig());

describe("Author", () => {
  it("works", async () => {
    const em = newEntityManager();
    newAuthor(em);
    await em.flush();
  });
});

afterAll(() => {
  return sql.end();
});

export function newEntityManager(): EntityManager {
  const ctx = { sql };
  const opts: EntityManagerOpts = {
    driver: new PostgresDriver(sql),
  };
  return new EntityManager(ctx as any, opts);
}
