import { EntityManager, Loaded } from "joist-orm";
import { Author, Book, Publisher, PublisherSize } from "./entities";
import { knex, numberOfQueries, resetQueryCount } from "./setupDbTests";
import { Deferred } from "./Deferred";

describe("EntityManager", () => {
  it("can load an entity", async () => {
    await knex.insert({ first_name: "f" }).from("authors");
    const em = new EntityManager(knex);
    const author = await em.load(Author, "1");
    expect(author.firstName).toEqual("f");
  });

  it("can load multiple entities with one query", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ first_name: "a2" }).from("authors");
    resetQueryCount();

    const em = new EntityManager(knex);
    const [author1, author2] = await Promise.all([em.load(Author, "1"), em.load(Author, "2")]);
    expect(author1.firstName).toEqual("a1");
    expect(author2.firstName).toEqual("a2");
    expect(numberOfQueries).toEqual(1);
  });

  it("can load multiple entities in the right order", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ first_name: "a2" }).from("authors");

    const em = new EntityManager(knex);
    const [author2, author1] = await Promise.all([em.load(Author, "2"), em.load(Author, "1")]);
    expect(author1.firstName).toEqual("a1");
    expect(author2.firstName).toEqual("a2");
  });

  it("maintains a single entity instance", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    const em = new EntityManager(knex);
    const author1a = await em.load(Author, "1");
    const author1b = await em.load(Author, "1");
    expect(author1a).toStrictEqual(author1b);
  });

  it("inserts a new entity", async () => {
    const em = new EntityManager(knex);
    const author = new Author(em, { firstName: "a1" });
    await em.flush();

    const rows = await knex.select("*").from("authors");
    expect(rows.length).toEqual(1);
    expect(author.id).toEqual("1");
  });

  it("inserts then updates new entity", async () => {
    const em = new EntityManager(knex);
    const author = new Author(em, { firstName: "a1" });
    await em.flush();
    author.firstName = "a2";
    await em.flush();

    const rows = await knex.select("*").from("authors");
    expect(rows.length).toEqual(1);
    expect(rows[0].first_name).toEqual("a2");
  });

  it("inserts multiple entities in bulk", async () => {
    const em = new EntityManager(knex);
    new Author(em, { firstName: "a1" });
    new Author(em, { firstName: "a2" });
    await em.flush();
    // 4 = begin, assign ids, insert, commit
    expect(numberOfQueries).toEqual(4);
    const rows = await knex.select("*").from("authors");
    expect(rows.length).toEqual(2);
  });

  it("updates an entity", async () => {
    const em = new EntityManager(knex);
    const author = new Author(em, { firstName: "a1" });
    await em.flush();
    expect(author.id).toEqual("1");

    author.firstName = "a2";
    await em.flush();
    expect(author.id).toEqual("1");

    const row = (await knex.select("*").from("authors"))[0];
    expect(row["first_name"]).toEqual("a2");
  });

  it("does not update inserted-then-unchanged entities", async () => {
    const em = new EntityManager(knex);
    new Author(em, { firstName: "a1" });
    await em.flush();
    resetQueryCount();
    await em.flush();
    expect(numberOfQueries).toEqual(0);
  });

  it("does not update updated-then-unchanged entities", async () => {
    const em = new EntityManager(knex);
    const author = new Author(em, { firstName: "a1" });
    await em.flush();
    author.firstName = "a2";
    await em.flush();
    resetQueryCount();
    await em.flush();
    expect(numberOfQueries).toEqual(0);
  });

  it("does not update changed-then-unchanged entities", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    a1.firstName = "a2";
    a1.firstName = "a3";
    a1.firstName = "a1";
    resetQueryCount();
    await em.flush();
    expect(numberOfQueries).toEqual(0);
  });

  it("createdAt / updatedAt are always non-null", async () => {
    const em = new EntityManager(knex);
    const author = em.create(Author, { firstName: "author" });
    expect(author.createdAt).not.toBeUndefined();
    expect(author.updatedAt).not.toBeUndefined();
  });

  it("createdAt does not change", async () => {
    const em = new EntityManager(knex);
    const a1 = em.create(Author, { firstName: "a1" });
    a1.firstName = "a2";
    await em.flush();

    const em2 = new EntityManager(knex);
    const a2 = await em2.load(Author, "1");
    expect(a2.createdAt).toEqual(a1.createdAt);
  });

  it("updatedAt does change", async () => {
    const em = new EntityManager(knex);
    const a1 = em.create(Author, { firstName: "a1" });
    await em.flush();

    await new Promise((resolve) => setTimeout(resolve, 10));

    const em2 = new EntityManager(knex);
    const a2 = await em2.load(Author, "1");
    a2.firstName = "a2";
    await em2.flush();

    const em3 = new EntityManager(knex);
    const a3 = await em3.load(Author, "1");
    expect(a3.updatedAt).not.toEqual(a1.updatedAt);
  });

  it("can insert falsey values", async () => {
    const em = new EntityManager(knex);
    em.create(Author, { firstName: "a1", isPopular: false });
    await em.flush();
    const rows = await knex.select("*").from("authors");
    expect(rows[0].is_popular).toEqual(false);
  });

  it("can update falsey values", async () => {
    await knex.insert({ first_name: "a1", is_popular: true }).from("authors");
    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    a1.isPopular = false;
    await em.flush();
    const rows = await knex.select("*").from("authors");
    expect(rows[0].is_popular).toEqual(false);
  });

  it("can update undefined values", async () => {
    await knex.insert({ first_name: "a1", is_popular: true }).from("authors");
    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    a1.isPopular = undefined;
    await em.flush();
    const rows = await knex.select("*").from("authors");
    expect(rows[0].is_popular).toEqual(null);
  });

  it("can load null values as undefined", async () => {
    await knex.insert({ first_name: "a1", is_popular: null }).from("authors");
    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    expect(a1.isPopular).toBeUndefined();
  });

  it("can save enums", async () => {
    const em = new EntityManager(knex);
    em.create(Publisher, { name: "a1", size: PublisherSize.Large });
    await em.flush();
    const rows = await knex.select("*").from("publishers");
    expect(rows[0].size_id).toEqual(2);

    const em2 = new EntityManager(knex);
    const p2 = await em2.load(Publisher, "1");
    expect(p2.size).toEqual(PublisherSize.Large);
  });

  it("can load null enums", async () => {
    await knex.insert({ name: "p1" }).from("publishers");
    const em = new EntityManager(knex);
    const p1 = await em.load(Publisher, "1");
    expect(p1.size).toBeUndefined();
  });

  it("can delete an entity", async () => {
    // Given a publisher
    await knex.insert({ name: "p1" }).from("publishers");
    const em = new EntityManager(knex);
    const p1 = await em.load(Publisher, "1");
    // When its deleted
    await em.delete(p1);
    await em.flush();
    // Then the row is deleted
    const rows = await knex.select("*").from("publishers");
    expect(rows.length).toEqual(0);
  });

  it("can delete multiple entities", async () => {
    // Given several publishers publisher
    await knex.insert({ name: "p1" }).from("publishers");
    await knex.insert({ name: "p2" }).from("publishers");
    const em = new EntityManager(knex);
    const p1 = await em.load(Publisher, "1");
    const p2 = await em.load(Publisher, "2");
    // When they are deleted
    await em.delete(p1);
    await em.delete(p2);
    await em.flush();
    // Then the rows are deleted
    expect((await knex.select("*").from("publishers")).length).toEqual(0);
  });

  it("does not re-delete an already deleted entity", async () => {
    // Given a publisher
    await knex.insert({ name: "p1" }).from("publishers");
    const em = new EntityManager(knex);
    const p1 = await em.load(Publisher, "1");
    // And its deleted
    await em.delete(p1);
    await em.flush();
    // When the EntityManager is flushed again
    resetQueryCount();
    await em.flush();
    // Then we did not re-delete the row
    expect(numberOfQueries).toEqual(0);
  });

  it("cannot modify a deleted entity", async () => {
    await knex.insert({ name: "p1" }).from("publishers");
    const em = new EntityManager(knex);
    const p1 = await em.load(Publisher, "1");
    await em.delete(p1);
    expect(() => (p1.name = "p2")).toThrow("Publisher#1 is marked as deleted");
  });

  it("cannot modify a deleted entity's o2m collection", async () => {
    await knex.insert({ name: "p1" }).from("publishers");
    const em = new EntityManager(knex);
    const p1 = await em.load(Publisher, "1");
    await em.delete(p1);
    expect(() => p1.authors.add(em.create(Author, { firstName: "a1" }))).toThrow("Publisher#1 is marked as deleted");
  });

  it("cannot modify a deleted entity's m2o collection", async () => {
    await knex.insert({ first_name: "a1" }).into("authors");
    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    await em.delete(a1);
    expect(() => a1.publisher.set(em.create(Publisher, { name: "p1" }))).toThrow("Author#1 is marked as deleted");
  });

  it("refresh an entity", async () => {
    await knex.insert({ name: "p1" }).from("publishers");
    // Given we've loaded an entity
    const em = new EntityManager(knex);
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
    await knex.insert({ name: "p1" }).from("publishers");
    await knex.insert({ first_name: "a1", publisher_id: 1 }).from("authors");
    // Given we've loaded an entity with a collection
    const em = new EntityManager(knex);
    const p1 = await em.load(Publisher, "1", "authors");
    expect(p1.authors.get.length).toEqual(1);
    // And a new row is added by something else
    await knex.insert({ first_name: "a2", publisher_id: 1 }).into("authors");
    // When we refresh the entity
    await em.refresh(p1);
    // Then we have the new data
    expect(p1.authors.get[1].firstName).toEqual("a2");
  });

  it("refresh an entity with a loaded m2o reference", async () => {
    await knex.insert({ name: "p1" }).into("publishers");
    await knex.insert({ first_name: "a1", publisher_id: 1 }).into("authors");
    // Given we've loaded an entity with a reference
    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1", "publisher");
    expect(a1.publisher.get!.name).toEqual("p1");
    // And the foreign key is changed by something else
    await knex.insert({ name: "p2" }).from("publishers");
    await knex.update({ publisher_id: 2 }).where({ id: 1 }).from("authors");
    // When we refresh the entity
    await em.refresh(a1);
    // Then we have the new data
    expect(a1.publisher.get!.name).toEqual("p2");
  });

  it("refresh an entity with a loaded m2m collection", async () => {
    await knex.insert({ first_name: "a1" }).from("authors");
    await knex.insert({ title: "b1", author_id: 1 }).into("books");
    await knex.insert({ name: "t1" }).into("tags");
    await knex.insert({ tag_id: 1, book_id: 1 }).into("books_to_tags");
    // Given we've loaded an entity with a
    const em = new EntityManager(knex);
    const b1 = await em.load(Book, "1", "tags");
    expect(b1.tags.get.length).toEqual(1);
    // And a new join row is added by someone else
    await knex.insert({ name: "t2" }).into("tags");
    await knex.insert({ tag_id: 2, book_id: 1 }).into("books_to_tags");
    // When we refresh the entity
    await em.refresh(b1);
    // Then we have the new data
    expect(b1.tags.get!.length).toEqual(2);
  });

  it("refresh an entity that is deleted", async () => {
    await knex.insert({ name: "p1" }).into("publishers");
    await knex.insert({ first_name: "a1", publisher_id: 1 }).into("authors");
    // Given we've loaded an entity with a reference
    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1", "publisher");
    expect(a1.publisher.get!.name).toEqual("p1");
    // And the entity is deleted
    await knex("authors").where("id", 1).del();
    // When we refresh the entity
    await em.refresh(a1);
    // Then we're marked as deleted
    expect(a1.__orm.deleted).toEqual("deleted");
  });

  it("can access a m2o id without loading", async () => {
    await knex.insert({ first_name: "a1" }).into("authors");
    await knex.insert({ id: 2, title: "b1", author_id: 1 }).into("books");
    const em = new EntityManager(knex);
    const b1 = await em.load(Book, "2");
    expect(b1.author.id).toEqual("1");
  });

  it("can create and cast to nested m2o hints", async () => {
    const em = new EntityManager(knex);
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
    // And this would cause a compile error
    // expect(b2.author.get.publisher.get!.authors.get).toEqual(0);
  });

  it("can create and cast to nested o2m hints", async () => {
    const em = new EntityManager(knex);
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
    const em = new EntityManager(knex);
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
    const em = new EntityManager(knex);
    const a1 = em.create(Author, { firstName: "a1", lastName: null });
    await em.flush();
    expect(a1.lastName).toBeUndefined();
  });

  it("can hydrate from custom queries ", async () => {
    await knex.insert({ first_name: "a1" }).into("authors");
    const em = new EntityManager(knex);
    const a1 = em.hydrate(Author, (await knex.select("*").from("authors"))[0]);
    expect(a1.firstName).toEqual("a1");
  });

  it("can hydrate into an existing instance", async () => {
    await knex.insert({ first_name: "a1" }).into("authors");
    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    await knex.update({ first_name: "a1b" }).into("authors");
    const a1b = em.hydrate(Author, (await knex.select("*").from("authors"))[0]);
    expect(a1b).toStrictEqual(a1);
    expect(a1b.firstName).toEqual("a1b");
  });

  it("ignores sets of the same value", async () => {
    await knex.insert({ first_name: "a1" }).into("authors");
    const em = new EntityManager(knex);
    const a1 = await em.load(Author, "1");
    a1.firstName = "a1";
    expect(a1.__orm.originalData).toEqual({});
  });

  it("can handle flush being called in a loop", async () => {
    await knex.insert({ name: "p1" }).into("publishers");
    await knex.insert({ name: "p2" }).into("publishers");
    await knex.insert({ first_name: "a1", publisher_id: 1 }).into("authors");
    await knex.insert({ first_name: "a2", publisher_id: 2 }).into("authors");
    const em = new EntityManager(knex);

    const authors = await em.find(Author, { id: ["1", "2"] }, { populate: "publisher" });
    resetQueryCount();
    await Promise.all(
      authors.map(async (a) => {
        // Turns out modifying two different entity types was important to trigger the race condition
        const p = a.publisher.get!;
        a.firstName = a.firstName + "b";
        p.name = p.name + "b";
        await em.flush();
      }),
    );
    // 2 begin/commit, 1 flush authors, 1 flush publishers
    expect(numberOfQueries).toEqual(4);
  });

  it("can handle flush being called in a loop with queries", async () => {
    await knex.insert({ name: "p1" }).into("publishers");
    await knex.insert({ name: "p2" }).into("publishers");
    await knex.insert({ first_name: "a1", publisher_id: 1 }).into("authors");
    await knex.insert({ first_name: "a2", publisher_id: 2 }).into("authors");
    const em = new EntityManager(knex);

    const authors = await em.find(Author, { id: ["1", "2"] });
    resetQueryCount();
    await Promise.all(
      authors.map(async (a) => {
        // The findOneOrFail's will be collected into a single call
        const p = await em.findOneOrFail(Publisher, { id: a.publisher.id });
        a.firstName = a.firstName + p.name;
        // And so this flush will be a single batch update of both authors
        await em.flush();
      }),
    );
    // 4 = 1 to (combined) select the publishers, 2 for begin/commit, 1 for bulk update authors.
    expect(numberOfQueries).toEqual(4);
    const rows = await knex.select("*").from("authors").orderBy("id");
    expect(rows[0].first_name).toEqual("a1p1");
    expect(rows[1].first_name).toEqual("a2p2");
  });

  it("can handle flush being called in a loop with other awaits", async () => {
    await knex.insert({ name: "p1" }).into("publishers");
    await knex.insert({ name: "p2" }).into("publishers");
    await knex.insert({ first_name: "a1", publisher_id: 1 }).into("authors");
    await knex.insert({ first_name: "a2", publisher_id: 2 }).into("authors");
    const em = new EntityManager(knex);

    // Create promises that we'll explicitly resolve in separate event ticks
    const deferreds = [new Deferred<string>(), new Deferred<string>()];
    const authors = await em.find(Author, { id: ["1", "2"] });

    resetQueryCount();
    const all = Promise.all(
      authors.map(async (a, i) => {
        const suffix = await deferreds[i].promise;
        a.firstName = a.firstName + suffix;
        await em.flush();
      }),
    );

    // Resolve the 1st one, which will start it's own flush
    deferreds[0].resolve("a");
    await delay(0);
    // resolve the 2nd one, which will also do it's own flush
    deferreds[1].resolve("b");
    await all;

    // Given the un-coordinated await's, the lambda event loops got out of sync,
    // so this required two flushes. Which is fine, we just want to cover the boundary
    // case and ensure it behaves correctly. If this was a concern in a real program,
    // some sort of `await latch` would be needed to break the lambdas back in sync.
    // 6 = (2 for begin/commit + 1 for update authors) x 2 for each flush.
    expect(numberOfQueries).toEqual(6);
    const rows = await knex.select("*").from("authors").orderBy("id");
    expect(rows[0].first_name).toEqual("a1a");
    expect(rows[1].first_name).toEqual("a2b");
  });

  it("can save tables with self-references", async () => {
    const em = new EntityManager(knex);
    const mentor = new Author(em, { firstName: "m1" });
    new Author(em, { firstName: "a1", mentor });
    await em.flush();
    const rows = await knex.select("*").from("authors").orderBy("id");
    expect(rows.length).toEqual(2);
    expect(rows[0].mentor_id).toBeNull();
    expect(rows[1].mentor_id).toEqual(1);
  });

  it("can save entities with columns that are keywords", async () => {
    const em = new EntityManager(knex);
    const a1 = new Author(em, { firstName: "a1" });
    const b1 = new Book(em, { title: "b1", author: a1 });
    await em.flush();
    b1.order = 1;
    await em.flush();
    const books = await em.find(Book, { order: { $gt: 0 } });
    expect(books.length).toEqual(1);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
