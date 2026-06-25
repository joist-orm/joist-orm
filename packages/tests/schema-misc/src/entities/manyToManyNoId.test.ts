import { Book, DatabaseOwner, newBook, newDatabaseOwner, newTag, Tag } from "@src/entities";
import { knex, newEntityManager, queries, resetQueryCount } from "@src/setupDbTests";
import { JsonAggregatePreloader } from "joist-orm";

// `book_to_tags` and `database_owner_to_tags` are id-less join tables, i.e. their primary key is
// just the composite of the two foreign keys, with no surrogate `id` column.
describe("m2m without a join-table id", () => {
  it("inserts join rows without a surrogate id", async () => {
    const em = newEntityManager();
    const b = newBook(em);
    const t1 = newTag(em, { title: "t1" });
    const t2 = newTag(em, { title: "t2" });
    b.tags.add(t1);
    b.tags.add(t2);
    resetQueryCount();
    await em.flush();
    // Then the insert keys off the FK pair, with no RETURNING id
    const insert = queries.find((q) => q.includes("INSERT INTO book_to_tags"))!;
    expect(insert).toMatch(/ON CONFLICT \(.*\) DO NOTHING/);
    expect(insert).not.toMatch(/RETURNING/);
    // And the rows are in the db
    const rows = await knex.select("*").from("book_to_tags").orderBy(["bookId", "tagId"]);
    expect(rows).toMatchObject([
      { bookId: 1, tagId: 1 },
      { bookId: 1, tagId: 2 },
    ]);
  });

  it("loads join rows sorted by the other entity's id", async () => {
    // Given a book with three tags added out-of-order
    const em1 = newEntityManager();
    const b = newBook(em1);
    const t1 = newTag(em1, { title: "t1" });
    const t2 = newTag(em1, { title: "t2" });
    const t3 = newTag(em1, { title: "t3" });
    await em1.flush();
    b.tags.add(t3);
    b.tags.add(t1);
    b.tags.add(t2);
    await em1.flush();
    // When we load the collection in a fresh em
    const em2 = newEntityManager();
    const b2 = await em2.load(Book, "b:1", "tags");
    // Then the tags come back sorted by tag id, not insertion order
    await expect(b2.tags.get).toMatchEntity([{ title: "t1" }, { title: "t2" }, { title: "t3" }]);
  });

  it("removes a loaded join row via its composite key", async () => {
    const em0 = newEntityManager();
    const b = newBook(em0);
    b.tags.add(newTag(em0, { title: "t1" }));
    b.tags.add(newTag(em0, { title: "t2" }));
    await em0.flush();
    // When we load and remove one
    const em = newEntityManager();
    const b2 = await em.load(Book, "b:1", "tags");
    b2.tags.remove(await em.load(Tag, "t:1"));
    resetQueryCount();
    await em.flush();
    // Then the delete keys off the FK pair
    const del = queries.find((q) => q.includes("DELETE FROM book_to_tags"))!;
    expect(del).toMatch(/WHERE \(.*\) IN \(/);
    const rows = await knex.select("*").from("book_to_tags");
    expect(rows).toMatchObject([{ bookId: 1, tagId: 2 }]);
  });

  it("removes against an unloaded collection via its composite key", async () => {
    const em0 = newEntityManager();
    const b = newBook(em0);
    b.tags.add(newTag(em0, { title: "t1" }));
    b.tags.add(newTag(em0, { title: "t2" }));
    await em0.flush();
    // When we remove without ever loading the collection
    const em = newEntityManager();
    const b2 = await em.load(Book, "b:1");
    b2.tags.remove(await em.load(Tag, "t:1"));
    await em.flush();
    // Then the row is gone
    const rows = await knex.select("*").from("book_to_tags");
    expect(rows).toMatchObject([{ bookId: 1, tagId: 2 }]);
  });

  it("supports set() diffing against the db", async () => {
    const em0 = newEntityManager();
    const b = newBook(em0);
    b.tags.add(newTag(em0, { title: "t1" }));
    b.tags.add(newTag(em0, { title: "t2" }));
    await em0.flush();
    // When we set a new list (drop t1, keep t2, add t3)
    const em = newEntityManager();
    const b2 = await em.load(Book, "b:1", "tags");
    b2.tags.set([await em.load(Tag, "t:2"), newTag(em, { title: "t3" })]);
    await em.flush();
    const rows = await knex.select("*").from("book_to_tags").orderBy(["bookId", "tagId"]);
    expect(rows).toMatchObject([
      { bookId: 1, tagId: 2 },
      { bookId: 1, tagId: 3 },
    ]);
  });

  it("supports find and includes", async () => {
    const em0 = newEntityManager();
    const b = newBook(em0);
    b.tags.add(newTag(em0, { title: "t1" }));
    newTag(em0, { title: "t2" });
    await em0.flush();
    const em = newEntityManager();
    const b2 = await em.load(Book, "b:1");
    expect(await b2.tags.includes(await em.load(Tag, "t:1"))).toBe(true);
    expect(await b2.tags.includes(await em.load(Tag, "t:2"))).toBe(false);
    const found = await b2.tags.find("t:1");
    expect(found).toMatchEntity({ title: "t1" });
  });

  it("preloads id-less join rows in sorted order", async () => {
    const em0 = newEntityManager();
    const b = newBook(em0);
    const t1 = newTag(em0, { title: "t1" });
    const t2 = newTag(em0, { title: "t2" });
    const t3 = newTag(em0, { title: "t3" });
    await em0.flush();
    b.tags.add(t3);
    b.tags.add(t1);
    b.tags.add(t2);
    await em0.flush();
    // When we load with the join-aggregate preloader enabled
    const em = newEntityManager({ preloadPlugin: new JsonAggregatePreloader() });
    const b2 = await em.load(Book, "b:1", "tags");
    // Then the preloaded order matches the lazy-load order (sorted by tag id)
    await expect(b2.tags.get).toMatchEntity([{ title: "t1" }, { title: "t2" }, { title: "t3" }]);
  });

  it("supports an id-less table with a createdAt column", async () => {
    const em = newEntityManager();
    const o = newDatabaseOwner(em, { name: "o1" });
    o.tags.add(newTag(em, { title: "t1" }));
    await em.flush();
    // Then the row exists and the db defaulted createdAt
    const rows = await knex.select("*").from("database_owner_to_tags");
    expect(rows).toMatchObject([{ databaseOwnerId: 1, tagId: 1 }]);
    expect(rows[0].createdAt).toBeDefined();
    // And it loads back
    const em2 = newEntityManager();
    const o2 = await em2.load(DatabaseOwner, "do:1", "tags");
    await expect(o2.tags.get).toMatchEntity([{ title: "t1" }]);
  });
});
