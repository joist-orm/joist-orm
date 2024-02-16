import { testDriver } from "@src/testEm";

// Note this test infrastructure exist solely to test Joist itself, i.e. to use
// the low-level driver infra to setup/assert against data. Downstream applications
// should not copy this approach, and instead just use the factories and entities to
// setup and assert against test data.

export function select(tableName: string): Promise<readonly any[]> {
  return testDriver.select(tableName);
}

export function update(tableName: string, row: Record<string, any>): Promise<void> {
  return testDriver.update(tableName, row);
}

// turns out delete as a function is not allowed, but it is as a method
export function del(tableName: string, id: number): Promise<void> {
  return testDriver.delete(tableName, id);
}

export function insertAuthor(row: {
  id?: number;
  first_name: string;
  last_name?: string | null;
  nick_names?: string[] | null;
  ssn?: string | null;
  age?: number | null;
  is_popular?: boolean | null;
  publisher_id?: number | null;
  mentor_id?: number | null;
  initials?: string;
  number_of_books?: number;
  favorite_colors?: number[];
  favorite_shape?: string;
  address?: object;
  business_address?: object;
  quotes?: string;
  graduated?: any;
  number_of_atoms?: string;
  number_of_public_reviews?: number;
  updated_at?: any;
  deleted_at?: any;
}) {
  return testDriver.insert("authors", {
    initials: row.first_name[0],
    number_of_books: 0,
    tags_of_all_books: "",
    ...row,
  });
}

export function insertBook(row: {
  id?: number;
  title: string;
  author_id: number | null;
  deleted_at?: Date;
  order?: number;
}) {
  return testDriver.insert("books", row);
}

export function insertComment(row: {
  id?: number;
  text: string;
  user_id?: number;
  parent_author_id?: number;
  parent_book_id?: number;
  parent_book_review_id?: number;
  parent_publisher_id?: number;
}) {
  return testDriver.insert("comments", row);
}

export function insertUser(row: {
  id?: number;
  name: string;
  email?: string;
  password?: string;
  author_id?: number;
  favorite_publisher_small_id?: number;
  favorite_publisher_large_id?: number;
}) {
  return testDriver.insert("users", {
    email: `${row.name}@example.com`,
    password: "password",
    ...row,
  });
}

export function insertPublisherOnly(row: {
  id?: number;
  name: string;
  longitude?: string | number;
  latitude?: string | number;
  huge_number?: string | number;
  size_id?: number;
  group_id?: number;
}) {
  return testDriver.insert("publishers", row);
}

/** Inserts a small publisher, into `publishers` and `small_publishers`. */
export async function insertPublisher(row: {
  id?: number;
  name: string;
  longitude?: string | number;
  latitude?: string | number;
  huge_number?: string | number;
  size_id?: number;
  group_id?: number;
  city?: string;
  updated_at?: Date;
}) {
  await testDriver.insert("publishers", row);
  await testDriver.insert("small_publishers", { id: row.id ?? 1, city: row.city ?? "city" });
}

/** Inserts a large publisher, into `publishers` and `large_publishers`. */
export async function insertLargePublisher(row: {
  id?: number;
  name: string;
  longitude?: string | number;
  latitude?: string | number;
  huge_number?: string | number;
  size_id?: number;
  group_id?: number;
  country?: string;
  updated_at?: Date;
}) {
  const { country = "country", ...others } = row;
  await testDriver.insert("publishers", others);
  await testDriver.insert("large_publishers", { id: row.id ?? 1, country });
}

export function insertTag(row: { id?: number; name: string }) {
  return testDriver.insert("tags", row);
}

export function insertPublisherGroup(row: { id?: number; name: string }) {
  return testDriver.insert("publisher_groups", row);
}

export function insertBookToTag(row: { id?: number; book_id: number; tag_id: number }) {
  return testDriver.insert("books_to_tags", row);
}

export function insertPublisherToTag(row: { id?: number; publisher_id: number; tag_id: number }) {
  return testDriver.insert("publishers_to_tags", row);
}

export function insertAuthorToTag(row: { id?: number; author_id: number; tag_id: number }) {
  return testDriver.insert("authors_to_tags", row);
}

export function insertUserLikedComment(row: { id?: number; liked_by_user_id: number; comment_id: number }) {
  return testDriver.insert("users_to_comments", row);
}

export function insertBookReview(row: {
  id?: number;
  book_id: number;
  rating: number;
  is_public?: boolean;
  is_test?: boolean;
}) {
  return testDriver.insert("book_reviews", { is_public: true, is_test: false, ...row });
}

export function insertImage(row: {
  id?: number;
  type_id: number;
  book_id?: number | null;
  author_id?: number | null;
  publisher_id?: number | null;
  file_name: string;
}) {
  return testDriver.insert("images", row);
}

export function insertCritic(row: {
  id?: number;
  name: string;
  group_id?: number;
  favorite_large_publisher_id?: number;
}) {
  return testDriver.insert("critics", row);
}
export function countOfBooks() {
  return testDriver.count("books");
}

export function countOfTags() {
  return testDriver.count("tags");
}

export function countOfBookToTags() {
  return testDriver.count("books_to_tags");
}

export function countOfAuthors() {
  return testDriver.count("authors");
}

export function countOfBookReviews() {
  return testDriver.count("book_reviews");
}
