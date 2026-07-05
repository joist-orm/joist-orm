import { JsonAggregatePreloader } from "joist-orm";
import { Book, DatabaseOwner, newTag, Tag } from "src/entities";
import { newEntityManager, queries, resetQueryCount } from "src/setupDbTests";
import { insertAuthor, insertBook, insertBookToTag, insertDatabaseOwner, insertTag, select } from "./inserts";

// `book_to_tags` and `database_owner_to_tags` are id-less join tables, i.e. their primary key is
// just the composite of the two foreign keys, with no surrogate `id` column.
describe("m2m without a join-table id", () => {
  it("inserts join rows without a surrogate id", async () => {
    // Given an existing book and two tags
    await insertAuthor({ firstName: "a1" });
    await insertBook({ title: "b1", authorId: 1 });
    await insertTag({ title: "t1" });
    await insertTag({ title: "t2" });
    // When we add them to the id-less m2m and flush
    const em = newEntityManager();
    const b = await em.load(Book, "b:1");
    b.tags.add(await em.load(Tag, "t:1"));
    b.tags.add(await em.load(Tag, "t:2"));
    resetQueryCount();
    await em.flush();
    // Then the insert keys off the FK pair, with `ON CONFLICT DO NOTHING` and no `RETURNING id`
    expect(queries).toMatchInlineSnapshot(`
     [
       "BEGIN;",
       "WITH data AS (SELECT unnest($1::int[]) as "bookId", unnest($2::int[]) as "tagId") INSERT INTO book_to_tags ("bookId", "tagId") SELECT * FROM data ON CONFLICT ("bookId", "tagId") DO NOTHING;",
       "COMMIT;",
     ]
    `);
    // And the rows are in the db
    expect(await select("book_to_tags", "bookId", "tagId")).toMatchObject([
      { bookId: 1, tagId: 1 },
      { bookId: 1, tagId: 2 },
    ]);
  });

  it("loads join rows sorted by the other entity's id", async () => {
    // Given a book with three tags, joined out-of-order
    await insertAuthor({ firstName: "a1" });
    await insertBook({ title: "b1", authorId: 1 });
    await insertTag({ title: "t1" });
    await insertTag({ title: "t2" });
    await insertTag({ title: "t3" });
    await insertBookToTag({ bookId: 1, tagId: 3 });
    await insertBookToTag({ bookId: 1, tagId: 1 });
    await insertBookToTag({ bookId: 1, tagId: 2 });
    // When we load the collection
    const em = newEntityManager();
    const b = await em.load(Book, "b:1", "tags");
    // Then the tags come back sorted by tag id, not insertion order
    await expect(b.tags.get).toMatchEntity([{ title: "t1" }, { title: "t2" }, { title: "t3" }]);
  });

  it("removes a loaded join row via its composite key", async () => {
    await insertAuthor({ firstName: "a1" });
    await insertBook({ title: "b1", authorId: 1 });
    await insertTag({ title: "t1" });
    await insertTag({ title: "t2" });
    await insertBookToTag({ bookId: 1, tagId: 1 });
    await insertBookToTag({ bookId: 1, tagId: 2 });
    // When we load and remove one
    const em = newEntityManager();
    const b = await em.load(Book, "b:1", "tags");
    b.tags.remove(await em.load(Tag, "t:1"));
    resetQueryCount();
    await em.flush();
    // Then the delete keys off the FK pair (composite key), not an id
    expect(queries).toMatchInlineSnapshot(`
     [
       "BEGIN;",
       "
             DELETE FROM book_to_tags
             WHERE ("bookId", "tagId") IN (
               SELECT (data->>0)::int, (data->>1)::int FROM jsonb_array_elements($1) data
             )",
       "COMMIT;",
     ]
    `);
    expect(await select("book_to_tags")).toMatchObject([{ bookId: 1, tagId: 2 }]);
  });

  it("removes against an unloaded collection via its composite key", async () => {
    await insertAuthor({ firstName: "a1" });
    await insertBook({ title: "b1", authorId: 1 });
    await insertTag({ title: "t1" });
    await insertTag({ title: "t2" });
    await insertBookToTag({ bookId: 1, tagId: 1 });
    await insertBookToTag({ bookId: 1, tagId: 2 });
    // When we remove without ever loading the collection
    const em = newEntityManager();
    const b = await em.load(Book, "b:1");
    b.tags.remove(await em.load(Tag, "t:1"));
    await em.flush();
    // Then the row is gone
    expect(await select("book_to_tags")).toMatchObject([{ bookId: 1, tagId: 2 }]);
  });

  it("supports set() diffing against the db", async () => {
    await insertAuthor({ firstName: "a1" });
    await insertBook({ title: "b1", authorId: 1 });
    await insertTag({ title: "t1" });
    await insertTag({ title: "t2" });
    await insertBookToTag({ bookId: 1, tagId: 1 });
    await insertBookToTag({ bookId: 1, tagId: 2 });
    // When we set a new list (drop t1, keep t2, add a new t3)
    const em = newEntityManager();
    const b = await em.load(Book, "b:1", "tags");
    b.tags.set([await em.load(Tag, "t:2"), newTag(em, { title: "t3" })]);
    await em.flush();
    expect(await select("book_to_tags", "bookId", "tagId")).toMatchObject([
      { bookId: 1, tagId: 2 },
      { bookId: 1, tagId: 3 },
    ]);
  });

  it("supports find and includes", async () => {
    await insertAuthor({ firstName: "a1" });
    await insertBook({ title: "b1", authorId: 1 });
    await insertTag({ title: "t1" });
    await insertTag({ title: "t2" });
    await insertBookToTag({ bookId: 1, tagId: 1 });
    const em = newEntityManager();
    const b = await em.load(Book, "b:1");
    expect(await b.tags.includes(await em.load(Tag, "t:1"))).toBe(true);
    expect(await b.tags.includes(await em.load(Tag, "t:2"))).toBe(false);
    const found = await b.tags.find("t:1");
    expect(found).toMatchEntity({ title: "t1" });
  });

  it("preloads id-less join rows in sorted order", async () => {
    await insertAuthor({ firstName: "a1" });
    await insertBook({ title: "b1", authorId: 1 });
    await insertTag({ title: "t1" });
    await insertTag({ title: "t2" });
    await insertTag({ title: "t3" });
    await insertBookToTag({ bookId: 1, tagId: 3 });
    await insertBookToTag({ bookId: 1, tagId: 1 });
    await insertBookToTag({ bookId: 1, tagId: 2 });
    // When we load with the join-aggregate preloader enabled
    const em = newEntityManager({ preloadPlugin: new JsonAggregatePreloader() });
    const b = await em.load(Book, "b:1", "tags");
    // Then the preloaded order matches the lazy-load order (sorted by tag id)
    await expect(b.tags.get).toMatchEntity([{ title: "t1" }, { title: "t2" }, { title: "t3" }]);
  });

  it("supports an id-less table with a createdAt column", async () => {
    // Given an existing database owner and tag
    await insertDatabaseOwner({ name: "o1" });
    await insertTag({ title: "t1" });
    // When we add via the EM and flush
    const em = newEntityManager();
    const o = await em.load(DatabaseOwner, "do:1");
    o.tags.add(await em.load(Tag, "t:1"));
    await em.flush();
    // Then the row exists and the db defaulted createdAt
    const rows = await select("database_owner_to_tags");
    expect(rows).toMatchObject([{ databaseOwnerId: 1, tagId: 1 }]);
    expect(rows[0].createdAt).toBeDefined();
    // And it loads back
    const em2 = newEntityManager();
    const o2 = await em2.load(DatabaseOwner, "do:1", "tags");
    await expect(o2.tags.get).toMatchEntity([{ title: "t1" }]);
  });
});
