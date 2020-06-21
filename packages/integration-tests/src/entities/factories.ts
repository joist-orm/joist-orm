import { knex } from "../setupDbTests";

export async function insertAuthor(row: {
  id?: number;
  first_name: string;
  last_name?: string | null;
  age?: number | null;
  is_popular?: boolean | null;
  publisher_id?: number | null;
  initials?: string;
  number_of_books?: number;
}) {
  await knex.insert({ initials: row.first_name[0], number_of_books: 0, ...row }).into("authors");
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

export async function insertBookReview(row: { id?: number; book_id: number; rating: number; is_public?: boolean }) {
  await knex.insert({ is_public: true, ...row }).into("book_reviews");
}

export async function insertJsonData(row: { id?: number; not_null_json: unknown, nullable_json: unknown | null }) {
  await knex.insert({ ...row }).into("json_data");
}
