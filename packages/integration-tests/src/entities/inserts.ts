import { knex } from "../setupDbTests";

export async function insertAuthor(row: {
  id?: number;
  first_name: string;
  last_name?: string | null;
  age?: number | null;
  is_popular?: boolean | null;
  publisher_id?: number | null;
  mentor_id?: number | null;
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

export async function insertImage(row: {
  id?: number;
  type_id: number;
  book_id?: number | null;
  author_id?: number | null;
  publisher_id?: number | null;
  file_name: string;
}) {
  await knex.insert(row).into("images");
}

export async function countOfBooks() {
  return (await knex.select("*").from("books")).length;
}

export async function countOfTags() {
  return (await knex.select("*").from("tags")).length;
}

export async function countOfBookToTags() {
  return (await knex.select("*").from("books_to_tags")).length;
}

export async function countOfAuthors() {
  return (await knex.select("*").from("authors")).length;
}
