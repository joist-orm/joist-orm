import { knex } from "src/setupDbTests";

/** Inserts an author directly so tests can exercise hydration independently of persistence. */
export async function insertAuthor(row: { first_name: string; last_name?: string | null }): Promise<void> {
  await knex
    .insert({
      created_at: new Date(),
      updated_at: new Date(),
      ...row,
    })
    .into("authors");
}

/** Inserts a book with a caller-selected bigint id. */
export async function insertBook(row: { id: string; title: string; author_id: number }): Promise<void> {
  // Mark the sequence as used so the sequence-based test flusher includes this explicitly-id'd table.
  await knex.raw("select nextval('books_id_seq')");
  await knex
    .insert({
      created_at: new Date(),
      updated_at: new Date(),
      ...row,
    })
    .into("books");
}
