import {
  insertAuthor,
  insertBook,
  insertBookReview,
  insertBookToTag,
  insertPublisher,
  insertTag,
} from "@src/entities/inserts";
import { Loaded, setDefaultEntityLimit, setEntityLimit } from "joist-orm";
import { Author, Book, Publisher, PublisherSize } from "./entities";
import { knex, newEntityManager, numberOfQueries, queries, resetQueryCount } from "./setupDbTests";

describe("EntityManager", () => {
  it("can load an entity", async () => {
    await insertAuthor({ first_name: "f" });
    const em = newEntityManager();
    const author = await em.load(Author, "1");
    expect(author.firstName).toEqual("f");
  });

  it("can load an entity by tagged id", async () => {
    await insertAuthor({ first_name: "f" });
    const em = newEntityManager();
    const author = await em.load(Author, "a:1");
    expect(author.firstName).toEqual("f");
  });

  it("can load all entities by id", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });

    const em = newEntityManager();
    const [author1, author2] = await em.loadAll(Author, ["a:1", "a:2"]);
    expect(author1.firstName).toEqual("a1");
    expect(author2.firstName).toEqual("a2");
  });

  it("fails to load all entities by id when any of the ids do not exist", async () => {
    await insertAuthor({ first_name: "a1" });

    const em = newEntityManager();
    await expect(em.loadAll(Author, ["a:1", "a:2"])).rejects.toThrowError("a:2 were not found");
  });

  it("can load all entities by id without throwing an error when any of the ids do not exist", async () => {
    await insertAuthor({ first_name: "a1" });

    const em = newEntityManager();
    const authors = await em.loadAllIfExists(Author, ["a:1", "a:2"]);
    expect(authors).toHaveLength(1);
    expect(authors[0].firstName).toEqual("a1");
  });

  it("fails to load an entity by an invalid tagged id", async () => {
    await insertAuthor({ first_name: "f" });
    const em = newEntityManager();
    await expect(em.load(Author, "p:1")).rejects.toThrow("Invalid tagged id, expected tag a, got p:1");
  });

  it("can load multiple entities with one query", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    resetQueryCount();

    const em = newEntityManager();
    const [author1, author2] = await Promise.all([em.load(Author, "1"), em.load(Author, "2")]);
    expect(author1.firstName).toEqual("a1");
    expect(author2.firstName).toEqual("a2");
    expect(numberOfQueries).toEqual(1);
  });

  it("can load multiple entities in the right order", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });

    const em = newEntityManager();
    const [author2, author1] = await Promise.all([em.load(Author, "2"), em.load(Author, "1")]);
    expect(author1.firstName).toEqual("a1");
    expect(author2.firstName).toEqual("a2");
  });

  it("maintains a single entity instance", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const author1a = await em.load(Author, "1");
    const author1b = await em.load(Author, "1");
    expect(author1a).toStrictEqual(author1b);
  });

  it("inserts a new entity", async () => {
    const em = newEntityManager();
    const author = new Author(em, { firstName: "a1" });
    await em.flush();

    const rows = await knex.select("*").from("authors");
    expect(rows.length).toEqual(1);
    expect(author.id).toEqual("a:1");
  });

  it("inserts then updates new entity", async () => {
    const em = newEntityManager();
    const author = new Author(em, { firstName: "a1" });
    await em.flush();
    author.firstName = "a2";
    await em.flush();

    const rows = await knex.select("*").from("authors");
    expect(rows.length).toEqual(1);
    expect(rows[0].first_name).toEqual("a2");
  });

  it("inserts multiple entities in bulk", async () => {
    const em = newEntityManager();
    new Author(em, { firstName: "a1" });
    new Author(em, { firstName: "a2" });
    await em.flush();
    // 4 = begin, assign ids, insert, commit
    expect(numberOfQueries).toEqual(4);
    const rows = await knex.select("*").from("authors");
    expect(rows.length).toEqual(2);
  });

  it("updates an entity", async () => {
    const em = newEntityManager();
    const author = new Author(em, { firstName: "a1" });
    await em.flush();
    expect(author.id).toEqual("a:1");

    author.firstName = "a2";
    await em.flush();
    expect(author.id).toEqual("a:1");

    const row = (await knex.select("*").from("authors"))[0];
    expect(row["first_name"]).toEqual("a2");
  });

  it("does not update inserted-then-unchanged entities", async () => {
    const em = newEntityManager();
    new Author(em, { firstName: "a1" });
    await em.flush();
    resetQueryCount();
    await em.flush();
    expect(numberOfQueries).toEqual(0);
  });

  it("does not update updated-then-unchanged entities", async () => {
    const em = newEntityManager();
    const author = new Author(em, { firstName: "a1" });
    await em.flush();
    author.firstName = "a2";
    await em.flush();
    resetQueryCount();
    await em.flush();
    expect(numberOfQueries).toEqual(0);
  });

  it("does not update changed-then-unchanged entities", async () => {
    await insertAuthor({ first_name: "a1", initials: "a" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    a1.firstName = "a2";
    a1.firstName = "a3";
    a1.firstName = "a1";
    resetQueryCount();
    await em.flush();
    expect(numberOfQueries).toEqual(0);
  });

  it("createdAt / updatedAt are always non-null", async () => {
    const em = newEntityManager();
    const author = em.create(Author, { firstName: "author" });
    expect(author.createdAt).not.toBeUndefined();
    expect(author.updatedAt).not.toBeUndefined();
  });

  it("createdAt does not change", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    a1.firstName = "a2";
    await em.flush();

    const em2 = newEntityManager();
    const a2 = await em2.load(Author, "1");
    expect(a2.createdAt).toEqual(a1.createdAt);
  });

  it("updatedAt does change", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    await em.flush();

    await new Promise((resolve) => setTimeout(resolve, 10));

    const em2 = newEntityManager();
    const a2 = await em2.load(Author, "1");
    a2.firstName = "a2";
    await em2.flush();

    const em3 = newEntityManager();
    const a3 = await em3.load(Author, "1");
    expect(a3.updatedAt).not.toEqual(a1.updatedAt);
  });

  it("updatedAt does not change on noops on dates", async () => {
    const jan1 = new Date(2000, 0, 1);
    const jan2 = new Date(2000, 0, 2);

    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1", graduated: jan1 });
    await em.flush();

    await new Promise((resolve) => setTimeout(resolve, 10));
    const em2 = newEntityManager();
    const a2 = await em2.load(Author, "1");
    // Change graduated but then put it back
    a2.graduated = jan2;
    a2.graduated = jan1;
    await em2.flush();

    const em3 = newEntityManager();
    const a3 = await em3.load(Author, "1");
    expect(a3.updatedAt).toEqual(a1.updatedAt);
  });

  it("can insert falsey values", async () => {
    const em = newEntityManager();
    em.create(Author, { firstName: "a1", isPopular: false });
    await em.flush();
    const rows = await knex.select("*").from("authors");
    expect(rows[0].is_popular).toEqual(false);
  });

  it("can update falsey values", async () => {
    await insertAuthor({ first_name: "a1", is_popular: true });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    a1.isPopular = false;
    await em.flush();
    const rows = await knex.select("*").from("authors");
    expect(rows[0].is_popular).toEqual(false);
  });

  it("can update undefined values", async () => {
    await insertAuthor({ first_name: "a1", is_popular: true });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    a1.isPopular = undefined;
    await em.flush();
    const rows = await knex.select("*").from("authors");
    expect(rows[0].is_popular).toEqual(null);
  });

  it("can load null values as undefined", async () => {
    await insertAuthor({ first_name: "a1", is_popular: null });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    expect(a1.isPopular).toBeUndefined();
  });

  it("can load custom queries", async () => {
    await insertAuthor({ first_name: "a1", is_popular: null });
    const em = newEntityManager();
    const authors = await em.loadFromQuery(Author, knex.select("*").from("authors"));
    expect(authors.length).toEqual(1);
  });

  it("can load custom queries and maintain identity", async () => {
    await insertAuthor({ first_name: "a1", is_popular: null });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    const authors = await em.loadFromQuery(Author, knex.select("*").from("authors"));
    expect(authors[0]).toStrictEqual(a1);
  });

  it("can load custom queries and populate", async () => {
    await insertAuthor({ first_name: "a1", is_popular: null });
    const em = newEntityManager();
    const authors = await em.loadFromQuery(Author, knex.select("*").from("authors"), "books");
    expect(authors[0].books.get).toEqual([]);
  });

  it("can save enums", async () => {
    const em = newEntityManager();
    em.create(Publisher, { name: "a1", size: PublisherSize.Large });
    await em.flush();
    const rows = await knex.select("*").from("publishers");
    expect(rows[0].size_id).toEqual(2);

    const em2 = newEntityManager();
    const p2 = await em2.load(Publisher, "1");
    expect(p2.size).toEqual(PublisherSize.Large);
  });

  it("can load null enums", async () => {
    await insertPublisher({ name: "p1" });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "1");
    expect(p1.size).toBeUndefined();
  });

  it("can delete an entity", async () => {
    // Given a publisher
    await insertPublisher({ name: "p1" });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "1");
    // When its deleted
    em.delete(p1);
    await em.flush();
    // Then the row is deleted
    const rows = await knex.select("*").from("publishers");
    expect(rows.length).toEqual(0);
  });

  it("can delete multiple entities", async () => {
    // Given several publishers publisher
    await insertPublisher({ name: "p1" });
    await insertPublisher({ name: "p2" });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "1");
    const p2 = await em.load(Publisher, "2");
    // When they are deleted
    em.delete(p1);
    em.delete(p2);
    await em.flush();
    // Then the rows are deleted
    expect((await knex.select("*").from("publishers")).length).toEqual(0);
  });

  it("does not re-delete an already deleted entity", async () => {
    // Given a publisher
    await insertPublisher({ name: "p1" });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "1");
    // And its deleted
    em.delete(p1);
    await em.flush();
    // When the EntityManager is flushed again
    resetQueryCount();
    await em.flush();
    // Then we did not re-delete the row
    expect(numberOfQueries).toEqual(0);
  });

  it("cannot modify a deleted entity", async () => {
    await insertPublisher({ name: "p1" });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "1");
    em.delete(p1);
    await em.flush();
    expect(() => (p1.name = "p2")).toThrow("Publisher:1 is marked as deleted");
  });

  it("cannot modify a deleted entity's o2m collection", async () => {
    await insertPublisher({ name: "p1" });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "1");
    em.delete(p1);
    await em.flush();
    expect(() => p1.authors.add(em.create(Author, { firstName: "a1" }))).toThrow("Publisher:1 is marked as deleted");
  });

  it("cannot modify a deleted entity's m2o collection", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    em.delete(a1);
    await em.flush();
    expect(() => a1.publisher.set(em.create(Publisher, { name: "p1" }))).toThrow("Author:1 is marked as deleted");
  });

  it("refresh an entity", async () => {
    await insertPublisher({ name: "p1" });
    // Given we've loaded an entity
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "1");
    expect(p1.name).toEqual("p1");
    // And it's updated by something else
    await knex.update({ name: "p2" }).where({ id: 1 }).from("publishers");
    // When we refresh the entity
    await em.refresh(p1);
    // Then we have the new data
    expect(p1.name).toEqual("p2");
  });

  it("refresh an entity with a loaded o2m collection", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    // Given we've loaded an entity with a collection
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "1", "authors");
    expect(p1.authors.get.length).toEqual(1);
    // And a new row is added by something else
    await insertAuthor({ first_name: "a2", publisher_id: 1 });
    // When we refresh the entity
    await em.refresh(p1);
    // Then we have the new data
    expect(p1.authors.get[1].firstName).toEqual("a2");
  });

  it("refresh an entity with a loaded m2o reference", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    // Given we've loaded an entity with a reference
    const em = newEntityManager();
    const a1 = await em.load(Author, "1", "publisher");
    expect(a1.publisher.get!.name).toEqual("p1");
    // And the foreign key is changed by something else
    await insertPublisher({ name: "p2" });
    await knex.update({ publisher_id: 2 }).where({ id: 1 }).from("authors");
    // When we refresh the entity
    await em.refresh(a1);
    // Then we have the new data
    expect(a1.publisher.get!.name).toEqual("p2");
  });

  it("refresh an entity with a loaded m2m collection", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertTag({ name: "t1" });
    await insertBookToTag({ tag_id: 1, book_id: 1 });
    // Given we've loaded an entity with a
    const em = newEntityManager();
    const b1 = await em.load(Book, "1", "tags");
    expect(b1.tags.get.length).toEqual(1);
    // And a new join row is added by someone else
    await insertTag({ name: "t2" });
    await insertBookToTag({ tag_id: 2, book_id: 1 });
    // When we refresh the entity
    await em.refresh(b1);
    // Then we have the new data
    expect(b1.tags.get!.length).toEqual(2);
  });

  it("refresh an entity that is deleted", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    // Given we've loaded an entity with a reference
    const em = newEntityManager();
    const a1 = await em.load(Author, "1", "publisher");
    expect(a1.publisher.get!.name).toEqual("p1");
    // And the entity is deleted
    await knex("authors").where("id", 1).del();
    // When we refresh the entity
    await em.refresh(a1);
    // Then we're marked as deleted
    expect(a1.__orm.deleted).toEqual("deleted");
    expect(a1.isDeletedEntity).toEqual(true);
  });

  it("can access a m2o id without loading", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ id: 2, title: "b1", author_id: 1 });
    const em = newEntityManager();
    const b1 = await em.load(Book, "2");
    expect(b1.author.id).toEqual("a:1");
  });

  it("can create and cast to nested m2o hints", async () => {
    const em = newEntityManager();
    const bookHint = { author: "publisher" } as const;
    // Given we make an author, which we know as a loaded (and unset) publisher reference
    const a1 = em.create(Author, { firstName: "a1" });
    expect(a1.publisher.get).toBeUndefined();
    // When we create a new book with that author
    const b1 = em.create(Book, { title: "b1", author: a1 });
    // Then we can assign this book to a type hint var that is expecting a loaded author/publisher
    const b2: Loaded<Book, typeof bookHint> = b1;
    // And we can access the author and publisher synchronously w/o compile errors
    expect(b1.author.get.publisher.get).toBeUndefined();
    expect(b2.author.get.publisher.get).toBeUndefined();
    expect(() => {
      // And this would cause a compile error
      // @ts-expect-error
      return b2.author.get.publisher.get!.authors.get;
    }).toThrow(TypeError);
  });

  it("can create and cast to nested o2m hints", async () => {
    const em = newEntityManager();
    const publisherHint = { authors: "books" } as const;
    // Given we make a author, which we know as a loaded (and unset) books collection
    const a1 = em.create(Author, { firstName: "a1" });
    expect(a1.books.get.length).toEqual(0);
    // When we create a new publisher with that author
    const p1 = em.create(Publisher, { name: "p1", authors: [a1] });
    // Then we can assign this publisher to a type hint var that is expecting a loaded books/author
    const p2: Loaded<Publisher, typeof publisherHint> = p1;
    // And we can access the author and publisher synchronously w/o compile errors
    expect(p1.authors.get[0].books.get).toEqual([]);
    expect(p2.authors.get[0].books.get).toEqual([]);
    // And this would cause a compile error
    // expect(b2.author.get.publisher.get!.authors.get).toEqual(0);
  });

  it("does not add duplicate rows when using 'new'", async () => {
    // Given we create both an author and publisher
    const em = newEntityManager();
    const p1 = new Publisher(em, { name: "p1" });
    new Author(em, { firstName: "a1", publisher: p1 });
    // And we've flush all the entities to the db
    await em.flush();
    // When we load p1.authors for the 1st time
    const authors = await p1.authors.load();
    // Then we still only have 1 author in the collection
    expect(authors.length).toEqual(1);
  });

  it("can create and pass null to optional fields in opts", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1", lastName: null });
    await em.flush();
    expect(a1.lastName).toBeUndefined();
  });

  it("cannot create without a required field", async () => {
    const em = newEntityManager();
    // @ts-expect-error
    em.create(Author, {});
    // @ts-expect-error
    em.create(Author, { firstName: null });
    await expect(em.flush()).rejects.toThrow("firstName is required");
  });

  it("cannot createPartial without a required field as null", async () => {
    const em = newEntityManager();
    // Accepting partial-update style inputs is allowed at compile-time, but throws at runtime
    em.createPartial(Author, { firstName: null });
    await expect(em.flush()).rejects.toThrow("firstName is required");
  });

  it("cannot createPartial without a required field as undefined", async () => {
    const em = newEntityManager();
    // `undefined` is treated as ignore, and caught at flush time
    em.createPartial(Author, { firstName: undefined });
    await expect(em.flush()).rejects.toThrow("firstName is required");
  });

  it("can createPartial with an optional reference being undefined", async () => {
    const em = newEntityManager();
    em.createPartial(Author, { firstName: "a1", mentor: undefined });
    await em.flush();
  });

  it("cannot createPartial with a required reference being undefined", async () => {
    const em = newEntityManager();
    em.createPartial(Book, { title: "b1", author: undefined });
    await expect(em.flush()).rejects.toThrow("author is required");
  });

  it("cannot set with a null required field", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    // @ts-expect-error
    a1.set({ firstName: null });
    await expect(em.flush()).rejects.toThrow("firstName is required");
  });

  it("can setPartial with a null required field", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    // Accepting partial-update style inputs is allowed at compile-time, but throws at runtime
    a1.setPartial({ firstName: null });
    await expect(em.flush()).rejects.toThrow("firstName is required");
  });

  it("setPartial defaults to ignoredUndefined", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    a1.setPartial({ firstName: undefined });
    expect(a1.firstName).toEqual("a1");
  });

  it("can hydrate from custom queries ", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = em.hydrate(Author, (await knex.select("*").from("authors"))[0]);
    expect(a1.firstName).toEqual("a1");
  });

  it("can hydrate into an existing instance", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    await knex.update({ first_name: "a1b" }).into("authors");
    const a1b = em.hydrate(Author, (await knex.select("*").from("authors"))[0]);
    expect(a1b).toStrictEqual(a1);
    expect(a1b.firstName).toEqual("a1b");
  });

  it("ignores sets of the same value", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    a1.firstName = "a1";
    expect(a1.__orm.originalData).toEqual({});
  });

  it("ignores date sets of the same value", async () => {
    await knex.insert({ first_name: "a1", initials: "a", number_of_books: 1, graduated: "2000-01-01" }).into("authors");
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    a1.graduated = new Date(2000, 0, 1);
    expect(a1.__orm.originalData).toEqual({});
  });

  it("cannot flush while another flush is in progress", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    const em = newEntityManager();
    const author = await em.load(Author, "1");
    author.firstName = "new name";
    const flushPromise = em.flush();
    await delay(0);
    await expect(em.flush()).rejects.toThrow("Cannot flush while another flush is already in progress");
    await flushPromise;
  });

  it("can modify an entity inside a hook", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const author = await em.load(Author, "1");
    author.firstName = "new name";
    author.ageForBeforeFlush = 27;
    await em.flush();
    expect(author.age).toEqual(27);
  });

  it("cannot modify an entity during a flush outside hooks", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const author = await em.load(Author, "1");
    author.firstName = "new name";
    const flushPromise = em.flush();
    await delay(0);
    expect(() => (author.firstName = "different name")).toThrow(
      "Cannot set 'firstName' on Author:1 during a flush outside of a entity hook",
    );
    await flushPromise;
  });

  it("cannot modify an entity's o2m collection during a flush outside hooks", async () => {
    await insertPublisher({ name: "p1" });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "1");
    const a1 = em.create(Author, { firstName: "a1" });
    p1.name = "new name";
    const flushPromise = em.flush();
    await delay(0);
    expect(() => p1.authors.add(a1)).toThrow(
      "Cannot set 'publisher' on Author:new during a flush outside of a entity hook",
    );
    await flushPromise;
  });

  it("cannot modify an entity's m2o collection during a flush outside hooks", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    const p1 = em.create(Publisher, { name: "p1" });
    a1.firstName = a1.firstName + "b";
    const flushPromise = em.flush();
    await delay(0);
    expect(() => a1.publisher.set(p1)).toThrow(
      "Cannot set 'publisher' on Author:1 during a flush outside of a entity hook",
    );
    await flushPromise;
  });

  it("will dedup queries that are loaded at the same time", async () => {
    await insertPublisher({ name: "p1" });
    const em = newEntityManager();
    resetQueryCount();
    // Given two queries with exactly the same where clause
    const p1p = em.find(Publisher, { id: "1" });
    const p2p = em.find(Publisher, { id: "1" });
    // When they are executed in the same event loop
    const [p1, p2] = await Promise.all([p1p, p2p]);
    // Then we issue a single SQL query
    expect(numberOfQueries).toEqual(1);
    // And it's the regular/sane query, i.e. not auto-batched
    expect(queries).toEqual([
      'select "p0".* from "publishers" as "p0" where "p0"."id" = ? order by "p0"."id" asc limit ?',
    ]);
    // And both results are the same
    expect(p1.length).toEqual(1);
    expect(p1).toEqual(p2);
  });

  it("does dedup queries with different order bys", async () => {
    await insertPublisher({ name: "p1" });
    await insertPublisher({ name: "p2" });
    const em = newEntityManager();
    resetQueryCount();
    // Given two queries with exactly the same where clause but different orders
    const p1p = em.find(Publisher, { id: "1" }, { orderBy: { id: "ASC" } });
    const p2p = em.find(Publisher, { id: "1" }, { orderBy: { id: "DESC" } });
    // When they are executed in the same event loop
    const [p1, p2] = await Promise.all([p1p, p2p]);
    // Then we issue a single SQL query
    expect(numberOfQueries).toEqual(1);
    // And it is still auto-batched
    expect(queries).toEqual([
      'select *, -1 as __tag, -1 as __row from "publishers" where "id" = ? union all (select "p0".*, 0 as __tag, row_number() over () as __row from "publishers" as "p0" where "p0"."id" = ? and "p0"."id" = ? order by "p0"."id" ASC, "p0"."id" ASC, "p0"."id" asc limit ?) union all (select "p0".*, 1 as __tag, row_number() over () as __row from "publishers" as "p0" where "p0"."id" = ? and "p0"."id" = ? order by "p0"."id" DESC, "p0"."id" DESC, "p0"."id" asc limit ?) order by "__tag" asc',
    ]);
    // And the results are the expected reverse of each other
    expect(p1.reverse()).toEqual(p2);
  });

  it("can save tables with self-references", async () => {
    const em = newEntityManager();
    const mentor = new Author(em, { firstName: "m1" });
    new Author(em, { firstName: "a1", mentor });
    await em.flush();
    const rows = await knex.select("*").from("authors").orderBy("id");
    expect(rows.length).toEqual(2);
    expect(rows[0].mentor_id).toBeNull();
    expect(rows[1].mentor_id).toEqual(1);
  });

  it("can save entities with columns that are keywords", async () => {
    const em = newEntityManager();
    const a1 = new Author(em, { firstName: "a1" });
    const b1 = new Book(em, { title: "b1", author: a1 });
    await em.flush();
    b1.order = 1;
    await em.flush();
    const books = await em.find(Book, { order: { gt: 0 } });
    expect(books.length).toEqual(1);
  });

  it("can find with findOrCreate", async () => {
    const em = newEntityManager();
    new Author(em, { firstName: "a1" });
    await em.flush();
    const a = await em.findOrCreate(Author, { firstName: "a1" }, {});
    expect(a.id).toEqual("a:1");
  });

  it("can find by optional field with findOrCreate", async () => {
    const em = newEntityManager();
    new Author(em, { firstName: "a1", age: 20 });
    await em.flush();
    const a = await em.findOrCreate(Author, { age: 20 }, { firstName: "a2" });
    expect(a.id).toEqual("a:1");
    // we leave firstName alone since it was in the ifNew hash
    expect(a.firstName).toEqual("a1");
  });

  it("can create with findOrCreate", async () => {
    const em = newEntityManager();
    new Author(em, { firstName: "a1" });
    await em.flush();
    const a = await em.findOrCreate(Author, { firstName: "a2" }, { age: 20 }, { lastName: "l" });
    expect(a.id).toBeUndefined();
    expect(a.lastName).toEqual("l");
    expect(a.age).toEqual(20);
  });

  it("can upsert with findOrCreate", async () => {
    const em = newEntityManager();
    new Author(em, { firstName: "a1" });
    await em.flush();
    const a = await em.findOrCreate(Author, { firstName: "a1" }, { age: 20 }, { lastName: "l" });
    expect(a.id).toEqual("a:1");
    expect(a.lastName).toEqual("l");
    expect(a.age).toBeUndefined();
  });

  it("findOrCreate doesn't compile if required field is missing", async () => {
    const em = newEntityManager();
    // @ts-expect-error
    await em.findOrCreate(Author, { age: 20 }, { lastName: "l" });
  });

  it("can find and populate with findOrCreate", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    const b1 = await em.findOrCreate(Book, { title: "b1", author: a1 }, {}, {}, "author");
    expect(b1.author.get).toEqual(a1);
  });

  it("can set derived values", async () => {
    const em = newEntityManager();
    const a1 = new Author(em, { firstName: "a1", lastName: "last" });
    expect(a1.initials).toEqual("al");
    await em.flush();
    expect((await knex.select("*").from("authors"))[0]["initials"]).toEqual("al");

    // Changing the derived value issues an update
    resetQueryCount();
    a1.firstName = "b1";
    await em.flush();
    // 3 = begin, update, commit
    expect(numberOfQueries).toEqual(3);
    expect((await knex.select("*").from("authors"))[0]["initials"]).toEqual("bl");

    // Not changing the derived value does not issue an update
    resetQueryCount();
    await em.flush();
    expect(numberOfQueries).toEqual(0);
  });

  it("can delete entities that have derived values", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    em.delete(a1);
    await em.flush();
    const rows = await knex.select("*").from("authors");
    expect(rows.length).toEqual(0);
  });

  it("can cascade deletes into other entities", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    em.delete(a1);
    await em.flush();
    const rows = await knex.select("*").from("books");
    expect(rows.length).toEqual(0);
  });

  it("can cascade deletes into other loaded entities", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    await em.load(Book, "1");
    em.delete(a1);
    await em.flush();
    const rows = await knex.select("*").from("books");
    expect(rows.length).toEqual(0);
  });

  it("can cascade deletes through multiple levels", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 5 });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    em.delete(a1);
    await em.flush();
    const bookRows = await knex.select("*").from("books");
    const bookReviewRows = await knex.select("*").from("book_reviews");
    expect(bookRows).toHaveLength(0);
    expect(bookReviewRows).toHaveLength(0);
  });

  it("caches finds within a UnitOfWork", async () => {
    await insertPublisher({ name: "p1" });
    const em = newEntityManager();
    resetQueryCount();
    // Given two queries with exactly the same where clause
    await em.find(Publisher, { id: "1" });
    // And one is executed in another event loop
    await em.find(Publisher, { id: "1" });
    // Then we only issued a single SQL query
    expect(numberOfQueries).toEqual(1);
  });

  it("resets the find cache after a flush", async () => {
    await insertPublisher({ name: "p1" });
    const em = newEntityManager();
    // Given two queries with exactly the same where clause
    await em.find(Publisher, { id: "1" });
    // And we flush before executing the next query
    em.create(Publisher, { name: "p2" });
    await em.flush();
    // Then we re-issue the SQL query
    resetQueryCount();
    await em.find(Publisher, { id: "1" });
    expect(numberOfQueries).toEqual(1);
  });

  it("has a simple toJSON", async () => {
    const em = newEntityManager();
    expect(JSON.stringify(em)).toEqual(`"<EntityManager 0>"`);
  });

  it("has a simple toJSON for entities", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    a1.publisher.set(em.create(Publisher, { name: "p1" }));
    expect(a1.toJSON()).toMatchObject({
      id: "a:1",
      firstName: "a1",
      publisher: "Publisher:new",
    });
  });

  it("cannot load too many entities", async () => {
    try {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      await insertPublisher({ name: "p1" });

      setEntityLimit(3);
      const em = newEntityManager();
      await em.find(Author, {});
      await expect(em.find(Publisher, {})).rejects.toThrow("More than 3 entities have been instantiated");
    } finally {
      setDefaultEntityLimit();
    }
  });

  it("doesnt allow unknown fields to create", async () => {
    const em = newEntityManager();
    expect(() => {
      // @ts-ignore-error
      em.create(Author, { firstName: "a1", invalidKey: 1 });
    }).toThrow("Unknown field invalidKey");
  });

  it("runs a beforeTransaction once on flush", async () => {
    const em = newEntityManager();
    let beforeTransactionCount = 0;
    em.beforeTransaction(() => {
      beforeTransactionCount += 1;
    });
    em.create(Author, { firstName: "a1" });
    await em.flush();
    expect(beforeTransactionCount).toEqual(1);
  });

  it("runs a beforeTransaction once on a transaction", async () => {
    const em = newEntityManager();
    let beforeTransactionCount = 0;
    em.beforeTransaction(() => {
      beforeTransactionCount += 1;
    });
    await em.transaction(async () => {
      em.create(Author, { firstName: "a1" });
      await em.flush();

      em.create(Author, { firstName: "a2" });
      await em.flush();
    });
    expect(beforeTransactionCount).toEqual(1);
  });

  it("runs a afterTransaction once on flush", async () => {
    const em = newEntityManager();
    let afterTransactionCount = 0;
    em.afterTransaction(() => {
      afterTransactionCount += 1;
    });
    em.create(Author, { firstName: "a1" });
    await em.flush();
    expect(afterTransactionCount).toEqual(1);
  });

  it("runs a afterTransaction once on a transaction", async () => {
    const em = newEntityManager();
    let afterTransactionCount = 0;
    em.afterTransaction(() => {
      afterTransactionCount += 1;
    });
    await em.transaction(async () => {
      em.create(Author, { firstName: "a1" });
      await em.flush();

      em.create(Author, { firstName: "a2" });
      await em.flush();
    });
    expect(afterTransactionCount).toEqual(1);
  });

  it("can save entities", async () => {
    const em = newEntityManager();
    const a1 = new Author(em, { firstName: "a1" });
    expect(a1.isNewEntity).toBeTruthy();
    expect(a1.isDirtyEntity).toBeTruthy();
    await em.flush();
    expect(a1.isNewEntity).toBeFalsy();
    expect(a1.isDirtyEntity).toBeFalsy();
  });

  it("returns newly created entities from flush()", async () => {
    const em = newEntityManager();

    // Given a newly created entity
    const a1 = new Author(em, { firstName: "a1" });

    // When we flush the entity manager
    const [result] = await em.flush();

    // Then the entity was returned from the flush
    expect(result).toEqual(a1);
  });

  it("returns updated entities from flush()", async () => {
    const em = newEntityManager();

    // Given an entity
    const a1 = new Author(em, { firstName: "a1" });
    await em.flush();

    // When we update that entity
    a1.firstName = "new name";
    // And we flush the entity manager
    const [result] = await em.flush();

    // Then the updated entity was returned from the flush
    expect((result as Author).firstName).toEqual("new name");
  });

  it("returns deleted entities from flush()", async () => {
    const em = newEntityManager();

    // Given an entity
    const a1 = new Author(em, { firstName: "a1" });
    await em.flush();

    // When we delete that entity
    em.delete(a1);
    // And we flush the entity manager
    const [result] = await em.flush();

    // Then the deleted entity was returned from the flush
    expect(result).toEqual(a1);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
