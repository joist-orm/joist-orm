import { driver } from "@src/setupMemoryTests";

function triggers(): any {
  return { created_at: new Date(), updated_at: new Date() };
}

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
  favorite_colors?: number[];
}) {
  driver.insert("authors", { ...triggers(), initials: row.first_name[0], number_of_books: 0, ...row });
}

export async function insertBook(row: { id?: number; title: string; author_id: number | null }) {
  driver.insert("books", { ...triggers(), ...row });
}

export async function insertPublisher(row: {
  id?: number;
  name: string;
  longitude?: string | number;
  latitude?: string | number;
  huge_number?: string | number;
  size_id?: number;
}) {
  driver.insert("publishers", { ...triggers(), ...row });
}

export async function insertTag(row: { id?: number; name: string }) {
  driver.insert("tags", { ...triggers(), ...row });
}

export async function insertBookToTag(row: { id?: number; book_id: number; tag_id: number }) {
  driver.insert("books_to_tags", row);
}

export async function insertBookReview(row: { id?: number; book_id: number; rating: number; is_public?: boolean }) {
  driver.insert("book_reviews", { ...triggers(), is_public: true, ...row });
}

export async function insertImage(row: {
  id?: number;
  type_id: number;
  book_id?: number | null;
  author_id?: number | null;
  publisher_id?: number | null;
  file_name: string;
}) {
  driver.insert("images", { ...triggers(), ...row });
}

export async function countOfBooks() {
  // return (await knex.select("*").from("books")).length;
}

export async function countOfTags() {
  // return (await knex.select("*").from("tags")).length;
}

export async function countOfBookToTags() {
  // return (await knex.select("*").from("books_to_tags")).length;
}

export async function countOfAuthors() {
  // return (await knex.select("*").from("authors")).length;
}
