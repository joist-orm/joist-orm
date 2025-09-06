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
  certificate?: any;
  range_of_books?: number;
  root_mentor_id?: number;
  image_tag_names?: string;
}) {
  return testDriver.insert("authors", {
    initials: row.first_name[0],
    number_of_books: 0,
    tags_of_all_books: "",
    ...row,
  });
}

export function insertTask(row: {
  id?: number;
  type: "OLD" | "NEW";
  special_new_field?: number | null;
  special_old_field?: number | null;
  duration_in_days?: number;
}) {
  const { type, ...rest } = row;
  return testDriver.insert("tasks", {
    type_id: type === "OLD" ? 1 : 2,
    duration_in_days: 0,
    ...rest,
  });
}

export function insertTaskItem(row: { id?: number; task_id?: number }) {
  const { ...rest } = row;
  return testDriver.insert("task_items", { ...rest });
}

export function insertBook(row: {
  id?: number;
  title: string;
  author_id: number | null;
  prequel_id?: number | null;
  deleted_at?: Date;
  order?: number;
}) {
  return testDriver.insert("books", { notes: "notes", ...row });
}

export function insertBookAdvance(row: { id?: number; book_id: number; publisher_id: number }) {
  return testDriver.insert("book_advances", {
    status_id: 1,
    ...row,
  });
}

export function insertComment(row: {
  id?: number;
  text: string;
  user_id?: number;
  parent_author_id?: number;
  parent_book_id?: number;
  parent_book_review_id?: number;
  parent_publisher_id?: number;
  parent_tags?: string;
}) {
  return testDriver.insert("comments", {
    parent_tags: "",
    ...row,
  });
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
  const { email = `${row.name}@example.com`, ...rest } = row;
  return testDriver.insert("users", {
    email,
    original_email: email,
    password: "password",
    ...rest,
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
  base_sync_default?: string;
  base_async_default?: string;
}) {
  return testDriver.insert("publishers", {
    base_sync_default: "FactorySyncDefault",
    base_async_default: "FactoryAsyncDefault",
    ...row,
  });
}

/** Inserts a small publisher, into `publishers` and `small_publishers`. */
export async function insertPublisher(row: {
  id?: number;
  name: string;
  longitude?: string | number;
  latitude?: string | number;
  huge_number?: string | number;
  number_of_book_reviews?: number;
  size_id?: number;
  group_id?: number;
  city?: string;
  shared_column?: string;
  updated_at?: Date;
  deleted_at?: Date;
  base_sync_default?: string;
  base_async_default?: string;
}) {
  const { shared_column, ...others } = row;
  await testDriver.insert("publishers", {
    base_sync_default: "FactorySyncDefault",
    base_async_default: "FactoryAsyncDefault",
    ...others,
  });
  await testDriver.insert(
    "small_publishers",
    {
      id: row.id ?? 1,
      city: row.city ?? "city",
      shared_column: row.shared_column,
    },
    true,
  );
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
  shared_column?: string;
  country?: string;
  updated_at?: Date;
  base_sync_default?: string;
  base_async_default?: string;
  spotlight_author_id?: number;
  rating?: number;
}) {
  const { country = "country", shared_column, ...others } = row;
  await testDriver.insert("publishers", {
    base_sync_default: "FactorySyncDefault",
    base_async_default: "FactoryAsyncDefault",
    rating: 5,
    ...others,
  });
  await testDriver.insert("large_publishers", { id: row.id ?? 1, country, shared_column }, true);
}

/** Inserts a small publisher, into `publishers` and `small_publishers`. */
export async function insertSmallPublisher(row: {
  id?: number;
  name: string;
  longitude?: string | number;
  latitude?: string | number;
  huge_number?: string | number;
  size_id?: number;
  group_id?: number;
  shared_column?: string;
  updated_at?: Date;
  base_sync_default?: string;
  base_async_default?: string;
  spotlight_author_id?: number;
  rating?: number;
  city?: string;

  // Used to test reactive fields that only exist on a subtype
  all_author_names?: string;
}) {
  const { city = "city", shared_column, ...others } = row;
  await testDriver.insert("publishers", {
    base_sync_default: "FactorySyncDefault",
    base_async_default: "FactoryAsyncDefault",
    rating: 5,
    ...others,
  });
  await testDriver.insert("small_publishers", { id: row.id ?? 1, city, shared_column }, true);
}

export function insertTag(row: { id?: number; name: string }) {
  return testDriver.insert("tags", row);
}

export function insertPublisherGroup(row: { id?: number; name: string; number_of_book_reviews?: number }) {
  return testDriver.insert("publisher_groups", {
    number_of_book_reviews: 0,
    number_of_book_reviews_formatted: "count=0",
    ...row,
  });
}

export async function insertSmallPublisherGroup(row: { id: number; name: string; number_of_book_reviews?: number }) {
  const { id, ...base } = row;
  await testDriver.insert("publisher_groups", {
    id,
    number_of_book_reviews: 0,
    number_of_book_reviews_formatted: "count=0",
    ...base,
  });
  await testDriver.insert("small_publisher_groups", { id, small_name: row.id }, true);
}

export function insertBookToTag(row: { id?: number; book_id: number; tag_id: number }) {
  return testDriver.insert("books_to_tags", row);
}

export function deleteBookToTag(id: number) {
  return testDriver.delete("books_to_tags", id);
}

export function insertPublisherToTag(row: { id?: number; publisher_id: number; tag_id: number }) {
  return testDriver.insert("publishers_to_tags", row);
}

export function insertAuthorToTag(row: { id?: number; author_id: number; tag_id: number }) {
  return testDriver.insert("authors_to_tags", row);
}

export function insertImageToTag(row: { id?: number; image_id: number; tag_id: number }) {
  return testDriver.insert("image_to_tags", row);
}

export function insertBookReview(row: {
  id?: number;
  book_id: number;
  rating: number;
  is_public?: boolean;
  is_test?: boolean;
}) {
  return testDriver.insert("book_reviews", { is_public: true, is_test: false, is_test_chain: false, ...row });
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
