import { parseCreateTable } from "./parseCreateTable";

describe("parseCreateTable", () => {
  it("parses simple table", () => {
    const sql = `CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email VARCHAR(255)
    )`;

    const result = parseCreateTable(sql);

    expect(result.name).toBe("users");
    expect(result.columns).toHaveLength(3);
    expect(result.columns[0]).toMatchObject({
      name: "id",
      type: "INTEGER",
      isPrimaryKey: true,
      isAutoIncrement: true,
    });
    expect(result.columns[1]).toMatchObject({
      name: "name",
      type: "TEXT",
      notNull: true,
    });
    expect(result.columns[2]).toMatchObject({
      name: "email",
      type: "VARCHAR(255)",
      notNull: false,
    });
  });

  it("parses inline foreign key", () => {
    const sql = `CREATE TABLE books (
      id INTEGER PRIMARY KEY,
      author_id INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE
    )`;

    const result = parseCreateTable(sql);

    expect(result.foreignKeys).toHaveLength(1);
    expect(result.foreignKeys[0]).toMatchObject({
      columns: ["author_id"],
      referencedTable: "authors",
      referencedColumns: ["id"],
      onDelete: "CASCADE",
    });
  });

  it("parses table-level foreign key constraint", () => {
    const sql = `CREATE TABLE books (
      id INTEGER PRIMARY KEY,
      author_id INTEGER NOT NULL,
      FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE SET NULL
    )`;

    const result = parseCreateTable(sql);

    expect(result.foreignKeys).toHaveLength(1);
    expect(result.foreignKeys[0]).toMatchObject({
      columns: ["author_id"],
      referencedTable: "authors",
      referencedColumns: ["id"],
      onDelete: "SET NULL",
    });
  });

  it("parses named constraint", () => {
    const sql = `CREATE TABLE books (
      id INTEGER PRIMARY KEY,
      author_id INTEGER NOT NULL,
      CONSTRAINT fk_books_author FOREIGN KEY (author_id) REFERENCES authors(id)
    )`;

    const result = parseCreateTable(sql);

    expect(result.foreignKeys[0].name).toBe("fk_books_author");
  });

  it("parses deferrable foreign key", () => {
    const sql = `CREATE TABLE books (
      id INTEGER PRIMARY KEY,
      author_id INTEGER REFERENCES authors(id) DEFERRABLE INITIALLY DEFERRED
    )`;

    const result = parseCreateTable(sql);

    expect(result.foreignKeys[0]).toMatchObject({
      isDeferrable: true,
      isDeferred: true,
    });
  });

  it("parses unique constraint", () => {
    const sql = `CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      UNIQUE (email)
    )`;

    const result = parseCreateTable(sql);

    expect(result.uniqueConstraints).toHaveLength(2);
  });

  it("parses default values", () => {
    const sql = `CREATE TABLE posts (
      id INTEGER PRIMARY KEY,
      status TEXT DEFAULT 'draft',
      created_at DATETIME DEFAULT (datetime('now'))
    )`;

    const result = parseCreateTable(sql);

    expect(result.columns[1].defaultValue).toBe("'draft'");
    expect(result.columns[2].defaultValue).toBe("(datetime('now'))");
  });

  it("parses table with quoted identifiers", () => {
    const sql = `CREATE TABLE "user-data" (
      "id" INTEGER PRIMARY KEY,
      "first-name" TEXT NOT NULL
    )`;

    const result = parseCreateTable(sql);

    expect(result.name).toBe("user-data");
    expect(result.columns[0].name).toBe("id");
    expect(result.columns[1].name).toBe("first-name");
  });

  it("parses multi-column foreign key", () => {
    const sql = `CREATE TABLE order_items (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      FOREIGN KEY (order_id, product_id) REFERENCES products(order_id, id)
    )`;

    const result = parseCreateTable(sql);

    expect(result.foreignKeys[0]).toMatchObject({
      columns: ["order_id", "product_id"],
      referencedTable: "products",
      referencedColumns: ["order_id", "id"],
    });
  });

  it("parses table-level primary key", () => {
    const sql = `CREATE TABLE items (
      id INTEGER,
      name TEXT,
      PRIMARY KEY (id)
    )`;

    const result = parseCreateTable(sql);

    expect(result.primaryKey).toEqual(["id"]);
  });

  it("parses type with precision", () => {
    const sql = `CREATE TABLE products (
      id INTEGER PRIMARY KEY,
      price DECIMAL(10,2) NOT NULL
    )`;

    const result = parseCreateTable(sql);

    expect(result.columns[1].type).toBe("DECIMAL(10,2)");
  });
});
