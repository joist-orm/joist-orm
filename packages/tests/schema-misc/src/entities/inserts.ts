import { knex } from "src/setupDbTests";

// Note this test infrastructure exists solely to test Joist itself, i.e. to use raw SQL to
// set up and assert against data without going through the EntityManager. Downstream
// applications should not copy this approach, and instead just use the factories and entities
// to set up and assert against test data.

export function select(tableName: string, ...orderBy: string[]): Promise<readonly any[]> {
  const query = knex.select("*").from(tableName);
  return (orderBy.length > 0 ? query.orderBy(orderBy) : query) as Promise<readonly any[]>;
}

export function insertAuthor(row: { id?: number; firstName: string; lastName?: string | null }) {
  return knex("authors").insert({ createdAt: new Date(), updatedAt: new Date(), ...row });
}

export function insertBook(row: { id?: number; title: string; authorId: number }) {
  return knex("book").insert(row);
}

export function insertTag(row: { id?: number; title: string }) {
  return knex("tags").insert(row);
}

export function insertDatabaseOwner(row: { id?: number; name: string }) {
  return knex("database_owners").insert(row);
}

export function insertBookToTag(row: { bookId: number; tagId: number }) {
  return knex("book_to_tags").insert(row);
}

export function insertDatabaseOwnerToTag(row: { databaseOwnerId: number; tagId: number; createdAt?: Date }) {
  return knex("database_owner_to_tags").insert(row);
}
