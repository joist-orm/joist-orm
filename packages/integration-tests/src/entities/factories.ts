import { knex } from "../setupDbTests";

export async function insertAuthor(row: {
  id?: number;
  first_name: string;
  last_name?: string | null;
  age?: number | null;
  is_popular?: boolean | null;
  publisher_id?: number | null;
  initials?: string;
}) {
  await knex.insert({ initials: row.first_name[0], ...row }).into("authors");
}

export async function insertBook(row: { id?: number; title: string; author_id: number | null }) {
  await knex.insert(row).into("books");
}

export async function insertPublisher(row: { id?: number; name: string; size_id?: number }) {
  await knex.insert(row).into("publishers");
}

export async function insertTag(row: { id?: number; name: string }) {
  await knex.insert(row).into("tags");
}

export async function insertBookToTag(row: { id?: number; book_id: number; tag_id: number }) {
  await knex.insert(row).into("books_to_tags");
}
