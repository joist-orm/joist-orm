import Database from "better-sqlite3";

import { loadSqliteSchema } from "./loadSqliteSchema.ts";

describe("loadSqliteSchema", () => {
  it("links a foreign key to both tables", () => {
    // Given books.author_id references authors
    const db = newDb();
    // When we load the schema
    const { tables } = loadSqliteSchema(db);
    // Then authors has an o2m to books
    expect(tables.get("authors").o2mRelations.map((r) => r.targetTable.name)).toEqual(["books"]);
  });

  it("marks an integer primary key as not null", () => {
    // Given SQLite reports `INTEGER PRIMARY KEY` columns as nullable
    const db = newDb();
    // When we load the schema
    const { tables } = loadSqliteSchema(db);
    // Then the id is a not null primary key, the same as in PostgreSQL
    expect(tables.get("authors").columns.get("id")).toMatchObject({ isPrimaryKey: true, notNull: true });
  });

  it("finds unique constraints", () => {
    // Given authors.email is UNIQUE
    const db = newDb();
    // When we load the schema
    const { tables } = loadSqliteSchema(db);
    // Then the constraint is found from SQLite's auto index
    expect(tables.get("authors").uniqueConstraints.map((u) => u.columns.map((c) => c.name))).toEqual([["email"]]);
  });

  it("reads deferrable foreign keys", () => {
    // Given books.author_id is DEFERRABLE INITIALLY DEFERRED
    const db = newDb();
    // When we load the schema
    const { tables } = loadSqliteSchema(db);
    // Then the foreign key is deferred, which only the CREATE TABLE sql tells us
    expect(tables.get("books").foreignKeys[0]).toMatchObject({
      isDeferrable: true,
      isDeferred: true,
      onDelete: "CASCADE",
    });
  });
});

function newDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email VARCHAR(255) UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}
