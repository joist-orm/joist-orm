import { readFileSync } from "node:fs";

import Database from "better-sqlite3";
import { SqliteDriver } from "joist-driver-sqlite";
import { toMatchEntity } from "joist-test-utils";
import { EntityManager } from "src/entities";

export let db: Database.Database;

export function newEntityManager(): EntityManager {
  const ctx = { db };
  const em = new EntityManager(ctx as any, new SqliteDriver(db));
  Object.assign(ctx, { em });
  return em;
}

expect.extend({ toMatchEntity });

beforeAll(async () => {
  db = new Database(":memory:");
  db.exec(readFileSync(`${__dirname}/../migrations/schema.sql`, "utf8"));
});

beforeEach(async () => {
  db.exec("DELETE FROM books");
  db.exec("DELETE FROM authors");
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('authors', 'books')");
});

afterAll(async () => {
  db.close();
});
