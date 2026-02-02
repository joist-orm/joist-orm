import Database from "better-sqlite3";
import { SqliteDriver } from "joist-driver-sqlite";
import { toMatchEntity } from "joist-test-utils";
import { EntityManager } from "@src/entities";

export let db: Database.Database;

export function newEntityManager(): EntityManager {
  const ctx = { db };
  const em = new EntityManager(ctx as any, {
    driver: new SqliteDriver(db),
  });
  Object.assign(ctx, { em });
  return em;
}

expect.extend({ toMatchEntity });

beforeAll(async () => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT,
      "delete" INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author_id INTEGER NOT NULL REFERENCES authors(id)
    )
  `);
});

beforeEach(async () => {
  db.exec("DELETE FROM books");
  db.exec("DELETE FROM authors");
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('authors', 'books')");
});

afterAll(async () => {
  db.close();
});
