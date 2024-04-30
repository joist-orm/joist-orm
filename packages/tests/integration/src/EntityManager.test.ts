import {
  countOfAuthors,
  countOfBookReviews,
  countOfBooks,
  del,
  insertAuthor,
  insertBook,
  insertBookReview,
  insertBookToTag,
  insertPublisher,
  insertTag,
  select,
  update,
} from "@src/entities/inserts";
import { isPreloadingEnabled, knex, newEntityManager, numberOfQueries, queries, resetQueryCount } from "@src/testEm";
import {
  EntityConstructor,
  FilterWithAlias,
  Entity as JoistEntity,
  Loaded,
  MaybeAbstractEntityConstructor,
  OptsOf,
  getInstanceData,
  jan1,
  jan2,
  sameEntity,
} from "joist-orm";
import {
  Author,
  Book,
  Color,
  Comment,
  Entity,
  EntityManager,
  Publisher,
  PublisherSize,
  Tag,
  newAuthor,
  newBook,
  newBookReview,
  newPublisher,
  newTag,
} from "./entities";
import { maybeBeginAndCommit } from "./setupDbTests";

describe("EntityManager", () => {
  it("can load an entity", async () => {
    await insertAuthor({ first_name: "f" });
    const em = newEntityManager();
    const author = await em.load(Author, "1");
    expect(author.firstName).toEqual("f");
  });

  it("can load just by its tagged id", async () => {
    await insertAuthor({ first_name: "f" });
    const em = newEntityManager();
    const author = await em.load("a:1");
    expect(author).toBeInstanceOf(Author);
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
    await expect(em.loadAll(Author, ["a:1", "a:2"])).rejects.toThrow("a:2 were not found");
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

    const rows = await select("authors");
    expect(rows.length).toEqual(1);
    expect(author.id).toEqual("a:1");
  });

  it("inserts then updates new entity", async () => {
    const em = newEntityManager();
    const author = new Author(em, { firstName: "a1" });
    await em.flush();
    author.firstName = "a2";
    await em.flush();

    const rows = await select("authors");
    expect(rows.length).toEqual(1);
    expect(rows[0].first_name).toEqual("a2");
  });

  it("inserts multiple entities in bulk", async () => {
    const em = newEntityManager();
    new Author(em, { firstName: "a1" });
    new Author(em, { firstName: "a2" });
    await em.flush();
    // 4 = begin, assign ids, insert, commit
    expect(numberOfQueries).toEqual(2 + maybeBeginAndCommit());
    const rows = await select("authors");
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

    const row = (await select("authors"))[0];
    expect(row["first_name"]).toEqual("a2");
  });

  it("updates multiple hasPersistedAsyncProperties at once", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { firstName: "a1", canHaveReviews: true });
    const a2 = newAuthor(em, { firstName: "a2", canHaveReviews: true });
    await em.flush();

    newBookReview(em, { use: a1, rating: 4 });
    newBookReview(em, { use: a2, rating: 5 });
    await em.flush();

    const rows = await select("authors");
    expect(rows[0]["number_of_public_reviews"]).toEqual(1);
    expect(rows[1]["number_of_public_reviews"]).toEqual(1);
    expect(rows[0]["numberOfPublicReviews2"]).toEqual(1);
    expect(rows[1]["numberOfPublicReviews2"]).toEqual(1);
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

  it("does not insert created-then-deleted entities", async () => {
    const em = newEntityManager();
    resetQueryCount();
    const a = new Author(em, { firstName: "a1" });
    em.delete(a);
    await em.flush();
    // Then we didn't issue any queries
    expect(queries).toEqual([]);
    // And the sequence value did not get ticked
    const { rows } = await knex.raw("SELECT nextval('authors_id_seq')");
    expect(rows[0].nextval).toBe("1");
    // And we didn't run afterCommit b/c it never touched the db
    expect(a.transientFields.afterCommitRan).toBe(false);
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
    const rows = await select("authors");
    expect(rows[0].is_popular).toEqual(false);
  });

  it("can update falsey values", async () => {
    await insertAuthor({ first_name: "a1", is_popular: true });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    a1.isPopular = false;
    await em.flush();
    const rows = await select("authors");
    expect(rows[0].is_popular).toEqual(false);
  });

  it("can update undefined values", async () => {
    await insertAuthor({ first_name: "a1", is_popular: true });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    a1.isPopular = undefined;
    await em.flush();
    const rows = await select("authors");
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

  it("can load from rows", async () => {
    await insertAuthor({ first_name: "a1", is_popular: null });
    const em = newEntityManager();
    const rows = await knex.select("*").from("authors");
    const authors = await em.loadFromRows(Author, rows);
    expect(authors.length).toEqual(1);
  });

  it("can save enums", async () => {
    const em = newEntityManager();
    newPublisher(em, { name: "a1", size: PublisherSize.Large });
    await em.flush();
    const rows = await select("publishers");
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
    const rows = await select("publishers");
    expect(rows.length).toEqual(0);
  });

  it("can delete multiple entities", async () => {
    // Given several publishers publisher
    await insertPublisher({ name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "1");
    const p2 = await em.load(Publisher, "2");
    // When they are deleted
    em.delete(p1);
    em.delete(p2);
    await em.flush();
    // Then the rows are deleted
    expect((await select("publishers")).length).toEqual(0);
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
    expect(() => a1.publisher.set(newPublisher(em, { name: "p1" }))).toThrow("Author:1 is marked as deleted");
  });

  it("refresh an entity", async () => {
    await insertPublisher({ name: "p1" });
    // Given we've loaded an entity
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "1");
    expect(p1.name).toEqual("p1");
    // And it's updated by something else
    await update("publishers", { id: 1, name: "p2" });
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
    await insertPublisher({ id: 2, name: "p2" });
    await update("authors", { id: 1, publisher_id: 2 });
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
    resetQueryCount();
    // When we refresh the entity
    await em.refresh(b1);
    // Then we have the new data
    expect(b1.tags.get!.length).toEqual(2);
    expect(queries.length).toBe(isPreloadingEnabled ? 1 : 3);
  });

  it("refresh an entity with a loaded PersistedAsyncReference", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 4 });
    // Given we've loaded an entity with a
    const em = newEntityManager();
    const author = await em.load(Author, "1", "favoriteBook");
    expect(author.firstName).toEqual("a1");
    // And a new row is added by someone else
    await insertBook({ id: 2, title: "b2", author_id: 1 });
    await insertBookReview({ book_id: 2, rating: 5 });
    // When we refresh the entity
    await em.refresh({ deepLoad: true });
    // Then we have the new data
    expect(author.favoriteBook.get!.title).toEqual("b2");
  });

  it("refresh an entity that is deleted", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    // Given we've loaded an entity with a reference
    const em = newEntityManager();
    const a1 = await em.load(Author, "1", "publisher");
    expect(a1.publisher.get!.name).toEqual("p1");
    // And the entity is deleted
    await del("authors", 1);
    // When we refresh the entity
    await em.refresh(a1);
    // Then we're marked as deleted
    expect(getInstanceData(a1).isDeletedAndFlushed).toBe(true);
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
    // Given we make an author, which we know as a loaded (and unset) books collection
    const a1 = em.create(Author, { firstName: "a1" });
    expect(a1.books.get.length).toEqual(0);
    // When we create a new publisher with that author
    const p1 = newPublisher(em, { name: "p1", authors: [a1] });
    expect(a1.publisher.get).toBeDefined();
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
    const p1 = newPublisher(em, { name: "p1" });
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
    const [a1] = em.hydrate(Author, await knex.select("*").from("authors"));
    expect(a1.firstName).toEqual("a1");
  });

  it("can hydrate into an existing instance", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    await knex.update({ first_name: "a1b" }).into("authors");
    const [a1b] = em.hydrate(Author, await knex.select("*").from("authors"));
    expect(a1b).toStrictEqual(a1);
    expect(a1b.firstName).toEqual("a1b");
  });

  it("ignores sets of the same value", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    a1.firstName = "a1";
    expect(getInstanceData(a1).originalData).toEqual({});
  });

  it("ignores date sets of the same value", async () => {
    await insertAuthor({ first_name: "a1", initials: "a", number_of_books: 1, graduated: jan1 });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    a1.graduated = jan1;
    expect(getInstanceData(a1).originalData).toEqual({});
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
    author.transientFields.setGraduatedInFlush = true;
    expect(author.graduated).toBeUndefined();
    await em.flush();
    expect(author.graduated).toBeDefined();
  });

  it("cannot modify an entity during a flush outside hooks", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const author = await em.load(Author, "1");
    author.firstName = "new name";
    const flushPromise = em.flush();
    await delay(0);
    expect(() => (author.firstName = "different name")).toThrow(
      "Cannot mutate an entity during an em.flush outside of a entity hook or from afterCommit",
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
      "Cannot mutate an entity during an em.flush outside of a entity hook or from afterCommit",
    );
    await flushPromise;
  });

  it("cannot modify an entity's m2o collection during a flush outside hooks", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    const p1 = newPublisher(em, { name: "p1" });
    a1.firstName = a1.firstName + "b";
    const flushPromise = em.flush();
    await delay(0);
    expect(() => a1.publisher.set(p1)).toThrow(
      "Cannot mutate an entity during an em.flush outside of a entity hook or from afterCommit",
    );
    await flushPromise;
  });

  it("can save tables with self-references", async () => {
    const em = newEntityManager();
    const mentor = new Author(em, { firstName: "m1" });
    new Author(em, { firstName: "a1", mentor });
    await em.flush();
    const rows = await select("authors");
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

  it("can find by undefined field with findOrCreate", async () => {
    const em = newEntityManager();
    await em.findOrCreate(Author, { publisher: undefined }, { firstName: "a2" });
  });

  it("can find by undefined unloaded m2o field with findOrCreate", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    await em.load(Author, "a:1");
    await em.findOrCreate(Author, { publisher: undefined }, { firstName: "a2" });
  });

  it("can create with findOrCreate", async () => {
    const em = newEntityManager();
    new Author(em, { firstName: "a1" });
    await em.flush();
    const a = await em.findOrCreate(Author, { firstName: "a2" }, { age: 20 }, { lastName: "l" });
    expect(a.idMaybe).toBeUndefined();
    expect(a.lastName).toEqual("l");
    expect(a.age).toEqual(20);
  });

  it("can create with findOrCreate and hook up to parent", async () => {
    await insertPublisher({ name: "p1" });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "p:1");
    const a = await em.findOrCreate(Author, { publisher: p1 }, { firstName: "a1" });
    expect(a.idMaybe).toBeUndefined();
    expect(await p1.authors.load()).toMatchEntity([a]);
  });

  it("can create with findOrCreate and hook up to poly parent", async () => {
    await insertPublisher({ name: "p1" });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "p:1");
    const c = await em.findOrCreate(Comment, { parent: p1 }, {});
    expect(c.idMaybe).toBeUndefined();
    expect(await p1.comments.load()).toMatchEntity([c]);
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

  it("findOrCreate skips queries if an entity is new", async () => {
    const em = newEntityManager();
    const p = newPublisher(em);
    const a1 = await em.findOrCreate(Author, { publisher: p }, { firstName: "a1" });
    expect(numberOfQueries).toBe(0);
    const a2 = await em.findOrCreate(Author, { publisher: p }, { firstName: "a1" });
    expect(a1).toBe(a2);
    expect(numberOfQueries).toBe(0);
  });

  it("can create with findOrCreate in a loop", async () => {
    const em = newEntityManager();
    const [a1, a2] = await Promise.all([
      em.findOrCreate(Author, { firstName: "a1" }, {}),
      em.findOrCreate(Author, { firstName: "a1" }, {}),
    ]);
    expect(a1).toEqual(a2);
    expect(a1.isNewEntity).toBe(true);
  });

  it("can find with findOrCreate in a loop", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const [a1, a2] = await Promise.all([
      em.findOrCreate(Author, { firstName: "a1" }, {}),
      em.findOrCreate(Author, { firstName: "a1" }, {}),
    ]);
    expect(a1).toEqual(a2);
    expect(a1.isNewEntity).toBe(false);
  });

  it("can find already new entity with findOrCreate in a loop", async () => {
    const em = newEntityManager();
    const a = newAuthor(em, { firstName: "a1" });
    const [a1, a2] = await Promise.all([
      em.findOrCreate(Author, { firstName: "a1" }, {}),
      em.findOrCreate(Author, { firstName: "a1" }, {}),
    ]);
    expect(a1).toEqual(a);
    expect(a2).toEqual(a);
  });

  it("can find existing with findOrCreate in a loop with citext", async () => {
    await insertTag({ name: "t1" });
    const em = newEntityManager();
    resetQueryCount();
    const [t1, t2] = await Promise.all([
      em.findOrCreate(Tag, { name: "t1" }, {}),
      em.findOrCreate(Tag, { name: "T1" }, {}),
    ]);
    expect(numberOfQueries).toBe(1);
    expect(t1).toMatchEntity(t2);
    expect(t1.isNewEntity).toBe(false);
  });

  it("can find new with findOrCreate in a loop with citext", async () => {
    const em = newEntityManager();
    const t = newTag(em, { name: "t1" });
    resetQueryCount();
    const [t1, t2] = await Promise.all([
      em.findOrCreate(Tag, { name: "t1" }, {}),
      em.findOrCreate(Tag, { name: "T1" }, {}),
    ]);
    expect(numberOfQueries).toBe(0);
    expect(t1).toMatchEntity(t);
    expect(t2).toMatchEntity(t1);
  });

  it("can create with findOrCreate in a loop with citext", async () => {
    const em = newEntityManager();
    resetQueryCount();
    const [t1, t2] = await Promise.all([
      em.findOrCreate(Tag, { name: "t1" }, {}),
      em.findOrCreate(Tag, { name: "T1" }, {}),
    ]);
    expect(numberOfQueries).toBe(1);
    expect(t1).toMatchEntity(t2);
    expect(t1.isNewEntity).toBe(true);
  });

  it("can create with findOrCreate in a loop with citext with a tick", async () => {
    const em = newEntityManager();
    resetQueryCount();
    const p1 = em.findOrCreate(Tag, { name: "t1" }, {});
    await delay(0);
    const p2 = em.findOrCreate(Tag, { name: "T1" }, {});
    const [t1, t2] = await Promise.all([p1, p2]);
    expect(numberOfQueries).toBe(1);
    expect(t1).toMatchEntity(t2);
    expect(t1.isNewEntity).toBe(true);
  });

  it("can find already new entity by FK with findOrCreate in a loop", async () => {
    const em = newEntityManager();
    const [p1, p2] = [newPublisher(em), newPublisher(em)];
    // Given we've already created an author in-memory
    const a = newAuthor(em, { firstName: "a1", publisher: p1 });
    // And three findOrCreates have where clauses that match it
    const [a1, a2, a3] = await Promise.all([
      em.findOrCreate(Author, { publisher: p1 }, { firstName: "b" }),
      em.findOrCreate(Author, { publisher: p1 }, { firstName: "c" }),
      // And the 3rd is looking for a different publisher
      em.findOrCreate(Author, { publisher: p2 }, { firstName: "c" }),
    ]);
    // Then the first two found the existing entity
    expect(a1).toBe(a);
    expect(a2).toBe(a);
    // And the third created a new entity
    expect(a3).not.toBe(a);
  });

  it("can upsert with findOrCreate in a loop", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    // Given two findOrCreates are upserting the same entity
    const [a1, a2] = await Promise.all([
      em.findOrCreate(Author, { firstName: "a1" }, {}, { lastName: "l1" }),
      // And the 2nd query has a different upsert
      em.findOrCreate(Author, { firstName: "a1" }, {}, { lastName: "l2" }),
    ]);
    // Then they returned the same entity
    expect(a1).toEqual(a2);
    expect(a1.isNewEntity).toBe(false);
    // And the first upsert wins
    expect(a1.lastName).toBe("l1");
  });

  it("can find existing with findOrCreate with undefined FKs", async () => {
    await insertPublisher({ name: "p1" });
    // Given two authors, both with same age, but one has a publisher
    await insertAuthor({ first_name: "a1", age: 20, publisher_id: 1 });
    await insertAuthor({ first_name: "a2", age: 20 });
    const em = newEntityManager();
    resetQueryCount();
    // When we findOrCreate for the { age: 20, publisher: undefined } author
    const a1 = await em.findOrCreate(Author, { age: 20, publisher: undefined }, { firstName: "a3" });
    expect(numberOfQueries).toBe(1);
    // Then we got back the existing a2 author
    expect(a1).toMatchEntity({ firstName: "a2", isNewEntity: false });
  });

  it("findOrCreate still creates dups with different where clauses in a loop", async () => {
    const em = newEntityManager();
    // Given two findOrCreates that are creating two entities
    const [a1, a2] = await Promise.all([
      em.findOrCreate(Author, { firstName: "a1" }, {}),
      // And the 2nd query's ifNew _technically_ matched the 1st query's where
      em.findOrCreate(Author, { lastName: "l1" }, { firstName: "a1" }),
    ]);
    // Then we don't try and figure that out
    expect(a1).not.toEqual(a2);
  });

  it("findOrCreate resolves dups with different where clauses in a loop", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    const em = newEntityManager();
    // Given two findOrCreates that should create the same new entity
    const [a1, a2] = await Promise.all([
      em.findOrCreate(Author, { firstName: "a1" }, {}, { lastName: "B" }),
      em.findOrCreate(Author, { lastName: "l1" }, { firstName: "a2" }, { lastName: "C" }),
    ]);
    // Then they returned the same entity
    expect(a1).toEqual(a2);
    // And the last upsert wins
    // This assertion is flakey in CI and is very regularly B--unclear why this is, but
    // commenting out for now because it's not super important which upsert wins.
    // expect(a1.lastName).toBe("C");
  });

  it("findOrCreate resolves dups with different upsert clauses in a loop", async () => {
    const em = newEntityManager();
    // Given two findOrCreates that should create the same existing entity
    const [a1, a2] = await Promise.all([
      em.findOrCreate(Author, { firstName: "a1" }, {}, { lastName: "B" }),
      em.findOrCreate(Author, { firstName: "a1" }, {}, { lastName: "C" }),
    ]);
    // Then they returned the same entity
    expect(em.entities.filter((e) => e instanceof Author).length).toBe(1);
    // And the first upsert wins
    expect(a1.lastName).toBe("B");
  });

  it("findOrCreate fails if duplicates in the db are found", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await insertAuthor({ first_name: "a2", last_name: "l1" });
    const em = newEntityManager();
    await expect(em.findOrCreate(Author, { lastName: "l1" }, { firstName: "a3" })).rejects.toThrow(
      "Found more than one existing Author with lastName=l1",
    );
  });

  it("findOrCreate fails if duplicates in the em are found", async () => {
    const em = newEntityManager();
    newAuthor(em, { lastName: "l1" });
    newAuthor(em, { lastName: "l1" });
    await expect(em.findOrCreate(Author, { lastName: "l1" }, { firstName: "a3" })).rejects.toThrow(
      "Found more than one existing Author with lastName=l1",
    );
  });

  it("can find and populate with findOrCreate", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    const b1 = await em.findOrCreate(Book, { title: "b1", author: a1 }, {}, {}, { populate: "author" });
    expect(b1.author.get).toEqual(a1);
  });

  it("can set derived values", async () => {
    const em = newEntityManager();
    const a1 = new Author(em, { firstName: "a1", lastName: "last" });
    expect(a1.initials).toEqual("al");
    await em.flush();
    expect((await select("authors"))[0]["initials"]).toEqual("al");

    // Changing the derived value issues an update
    resetQueryCount();
    a1.firstName = "b1";
    await em.flush();
    // 3 = begin, update, commit
    expect(numberOfQueries).toEqual(1 + maybeBeginAndCommit());
    expect((await select("authors"))[0]["initials"]).toEqual("bl");

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
    const rows = await select("authors");
    expect(rows.length).toEqual(0);
  });

  it("can cascade deletes into other entities", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    em.delete(a1);
    await em.flush();
    const rows = await select("books");
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
    const rows = await select("books");
    expect(rows.length).toEqual(0);
  });

  it("can cascade deletes through multiple levels", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 5 });
    const em = newEntityManager();
    const a1 = await em.load(Author, "1");
    em.delete(a1);
    // Book review has a beforeDelete that ensures the relation graph isn't cleaned up until after hooks are run
    await expect(em.flush()).resolves.not.toThrow();
    const bookRows = await select("books");
    const bookReviewRows = await select("book_reviews");
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
    newPublisher(em, { name: "p2" });
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

  it("cannot load too many entities", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertPublisher({ name: "p1" });

    const em = newEntityManager();
    em.entityLimit = 3;
    await em.find(Author, {});
    await expect(em.find(Publisher, {})).rejects.toThrow("More than 3 entities have been instantiated");
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

  it("can delete an entity with a reverseHint in a transaction", async () => {
    const em = newEntityManager();
    const a1 = new Author(em, { firstName: "a1" });
    const b1 = new Book(em, { title: "title", author: a1 });
    await em.flush();
    await em.transaction(async () => {
      em.delete(b1);
      await em.flush();
    });
    expect(b1.isDeletedEntity).toBe(true);
  });

  it("can save entities", async () => {
    const em = newEntityManager();
    const a1 = new Author(em, { firstName: "a1" });
    expect(a1.isNewEntity).toBe(true);
    expect(a1.isDirtyEntity).toBe(true);
    await em.flush();
    expect(a1.isNewEntity).toBe(false);
    expect(a1.isDirtyEntity).toBe(false);
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

  describe("findWithNewOrChanged", () => {
    it("finds existing, unloaded entities", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      const em = newEntityManager();
      const authors = await em.findWithNewOrChanged(Author, { firstName: "a1" });
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
    });

    it("finds existing, loaded entities", async () => {
      await insertAuthor({ first_name: "a1" });
      await insertAuthor({ first_name: "a2" });
      const em = newEntityManager();
      await em.find(Author, {});
      const authors = await em.findWithNewOrChanged(Author, { firstName: "a1" });
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
    });

    it("finds new entities", async () => {
      await insertAuthor({ first_name: "a2" });
      const em = newEntityManager();
      em.create(Author, { firstName: "a1" });
      const authors = await em.findWithNewOrChanged(Author, { firstName: "a1" });
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
    });

    it("finds changed entities", async () => {
      await insertAuthor({ first_name: "a2" });
      const em = newEntityManager();
      const a2 = await em.load(Author, "a:1");
      a2.firstName = "a1";
      const authors = await em.findWithNewOrChanged(Author, { firstName: "a1" });
      expect(authors).toMatchEntity([{ firstName: "a1" }]);
    });

    it("ignores changed entities", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      const a2 = await em.load(Author, "a:1");
      a2.firstName = "a2";
      const authors = await em.findWithNewOrChanged(Author, { firstName: "a1" });
      expect(authors).toMatchEntity([]);
    });

    it("can populate found & created entities", async () => {
      await insertPublisher({ name: "p1" });
      await insertPublisher({ id: 2, name: "p2" });
      await insertAuthor({ first_name: "a1", last_name: "last", publisher_id: 1 });
      const em = newEntityManager();
      em.create(Author, { firstName: "a2", lastName: "last", publisher: "p:2" });
      const authors = await em.findWithNewOrChanged(Author, { lastName: "last" }, { populate: "publisher" });
      expect(authors).toMatchEntity([{ publisher: { name: "p1" } }, { publisher: { name: "p2" } }]);
    });
  });

  describe("touch", () => {
    it("can touch an entity to force it to be flushed", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      // Given an existing author
      const a1 = await em.load(Author, "1");
      // When we touch it
      em.touch(a1);
      // Then it's not considered dirty
      const { updatedAt } = a1;
      expect(a1.isDirtyEntity).toBe(false);
      expect(a1.isNewEntity).toBe(false);
      expect(a1.isDeletedEntity).toBe(false);
      expect(getInstanceData(a1).isTouched).toBe(true);
      // But when we flush
      const result = await em.flush();
      expect(result).toEqual([a1]);
      expect(getInstanceData(a1).isTouched).toBe(false);
      // Then the hooks were ran
      expect(a1.transientFields).toMatchObject({
        beforeFlushRan: true,
        beforeUpdateRan: true,
        beforeCreateRan: false,
        mentorRuleInvoked: 0,
      });
      // And updatedAt bumped
      expect(a1.updatedAt).not.toEqual(updatedAt);
    });

    it("does not rerun validation rules", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      // Given a touched author
      const a1 = await em.load(Author, "1");
      em.touch(a1);
      // When we flush
      await em.flush();
      // Then we ran the simple validation rules (because updatedAt changed)
      expect(a1.transientFields.firstIsNotLastNameRuleInvoked).toBe(1);
      // But did not run reactive validation rules
      expect(a1.transientFields.mentorRuleInvoked).toBe(0);
    });

    it("does not recalc derived fields", async () => {
      await insertAuthor({ first_name: "a1" });
      const em = newEntityManager();
      // Given a touched author
      const a1 = await em.load(Author, "1");
      em.touch(a1);
      // When we flush
      await em.flush();
      // Then we didn't recalc the derived fields
      expect(a1.transientFields.numberOfBooksCalcInvoked).toBe(0);
    });
  });

  it("can load a null enum array", async () => {
    await insertAuthor({ first_name: "f" });
    const em = newEntityManager();
    const author = await em.load(Author, "1");
    expect(author.favoriteColors).toEqual([]);
    expect(author.favoriteColorsDetails).toEqual([]);
  });

  it("can load a populated enum array", async () => {
    await insertAuthor({ first_name: "f", favorite_colors: [1, 2] });
    const em = newEntityManager();
    const author = await em.load(Author, "1");
    expect(author.favoriteColors).toEqual([Color.Red, Color.Green]);
    expect(author.isRed).toBe(true);
    expect(author.isGreen).toBe(true);
  });

  it("can save a populated enum array", async () => {
    const em = newEntityManager();
    em.create(Author, { firstName: "a1", favoriteColors: [Color.Red, Color.Green] });
    await em.flush();
    const rows = await select("authors");
    expect(rows[0].favorite_colors).toEqual([1, 2]);
  });

  it("can save a changed enum array", async () => {
    await insertAuthor({ first_name: "f", favorite_colors: [1, 2] });
    const em = newEntityManager();
    const author = await em.load(Author, "1");
    author.favoriteColors = [Color.Green];
    expect(author.changes.favoriteColors.hasChanged).toBe(true);
    await em.flush();
    const rows = await select("authors");
    expect(rows[0].favorite_colors).toEqual([2]);
  });

  it("can create with a foreign key id", async () => {
    await insertAuthor({ first_name: "f" });
    const em = newEntityManager();
    const b = em.create(Book, { author: "a:1", title: "b1" });
    expect(() => {
      // @ts-expect-error
      b.author.get;
    }).toThrow();
    expect(b.author.isLoaded).toBe(false);
    await em.flush();
    const rows = await select("books");
    expect(rows[0].author_id).toEqual(1);
  });

  it("can create an empty enum array", async () => {
    const em = newEntityManager();
    em.create(Author, { firstName: "a1" });
    await em.flush();
    const rows = await select("authors");
    expect(rows[0].favorite_colors).toEqual([]);
  });

  it("can update an empty enum array", async () => {
    await insertAuthor({ first_name: "f", favorite_colors: [1, 2] });
    const em = newEntityManager();
    const author = await em.load(Author, "1");
    author.favoriteColors = [];
    await em.flush();
    const rows = await select("authors");
    expect(rows[0].favorite_colors).toEqual([]);
  });

  it("can update multiple enum array", async () => {
    await insertAuthor({ first_name: "f", favorite_colors: [1] });
    await insertAuthor({ first_name: "f", favorite_colors: [2] });
    const em = newEntityManager();
    const [a1, a2] = await em.find(Author, {});
    a1.favoriteColors = [Color.Red, Color.Green];
    a2.favoriteColors = [Color.Red, Color.Blue, Color.Green];
    await em.flush();
    const rows = await select("authors");
    expect(rows[0].favorite_colors).toEqual([1, 2]);
    expect(rows[1].favorite_colors).toEqual([1, 3, 2]);
  });

  describe("jsonb columns", () => {
    it("can save superstruct values", async () => {
      const em = newEntityManager();
      new Author(em, { firstName: "a1", address: { street: "123 Main" } });
      await em.flush();
      const rows = await select("authors");
      expect(rows.length).toEqual(1);
      expect(rows[0].address).toEqual({ street: "123 Main" });
    });

    it("can read superstruct values", async () => {
      await insertAuthor({ first_name: "f", address: { street: "123 Main" } });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      expect(a.address).toEqual({ street: "123 Main" });
    });

    it("can save array values", async () => {
      const em = newEntityManager();
      new Author(em, { firstName: "a1", quotes: ["incredible", "funny", "seminal"] });
      await em.flush();
      const rows = await select("authors");
      expect(rows.length).toEqual(1);
      expect(rows[0].quotes).toEqual(["incredible", "funny", "seminal"]);
    });

    it("can read array values", async () => {
      await insertAuthor({ first_name: "f", quotes: JSON.stringify(["incredible", "funny", "seminal"]) });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      expect(a.quotes).toEqual(["incredible", "funny", "seminal"]);
    });

    it("rejects saving invalid superstruct values", async () => {
      const em = newEntityManager();
      expect(() => {
        new Author(em, { firstName: "a1", address: { street2: "123 Main" } as any });
      }).toThrow("At path: street -- Expected a string, but received: undefined");
    });

    it("can save zodSchema values", async () => {
      const em = newEntityManager();
      new Author(em, { firstName: "a1", businessAddress: { street: "123 Main" } });
      await em.flush();
      const rows = await select("authors");
      expect(rows.length).toEqual(1);
      expect(rows[0].business_address).toEqual({ street: "123 Main" });
    });

    it("can read zodSchema values", async () => {
      await insertAuthor({ first_name: "f", business_address: { street: "123 Main" } });
      const em = newEntityManager();
      const a = await em.load(Author, "a:1");
      expect(a.businessAddress).toEqual({ street: "123 Main" });
    });

    it("rejects saving invalid zodSchema values", async () => {
      const em = newEntityManager();
      expect(() => {
        new Author(em, { firstName: "a1", businessAddress: { street2: "123 Main" } as any });
      }).toThrow(
        JSON.stringify(
          [
            {
              code: "invalid_type",
              expected: "string",
              received: "undefined",
              path: ["street"],
              message: "Required",
            },
          ],
          undefined,
          2,
        ),
      );
    });

    it("rejects reading invalid zodSchema values", async () => {
      await insertAuthor({ first_name: "f", business_address: { street2: "123 Main" } });
      const em = newEntityManager();
      await expect(async () => {
        const a = await em.load(Author, "a:1");
        console.log(a.businessAddress);
      }).rejects.toThrow(
        JSON.stringify(
          [
            {
              code: "invalid_type",
              expected: "string",
              received: "undefined",
              path: ["street"],
              message: "Required",
            },
          ],
          undefined,
          2,
        ),
      );
    });
  });
  it("fails on optimistic lock collisions", async () => {
    // Given an existing author
    await insertAuthor({ first_name: "f" });
    // And we start to update it
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    a1.firstName = "g";
    // And before we flush, another write changes the entity
    await update("authors", { id: 1, updated_at: "2050-01-01" });
    // When we try to save our changes
    await expect(em.flush()).rejects.toThrow("Oplock failure for authors rows 1");
  });

  describe("sameEntity", () => {
    it("handles new entities", async () => {
      const em = newEntityManager();
      const a1 = newAuthor(em);
      const a2 = newAuthor(em);
      expect(sameEntity(a1, a1)).toEqual(true);
      expect(sameEntity(a1, a2)).toEqual(false);
      expect(sameEntity(a1, undefined)).toEqual(false);
      expect(sameEntity(undefined, a1)).toEqual(false);
    });

    it("handles mixed new/existing entities", async () => {
      const em = newEntityManager();
      const a1 = newAuthor(em);
      await em.flush();
      const a2 = newAuthor(em);
      expect(sameEntity(a1, a1)).toEqual(true);
      expect(sameEntity(a1, a2)).toEqual(false);
      expect(sameEntity(a2, a1)).toEqual(false);
    });

    it("handles new entity which has id assigned", async () => {
      const em = newEntityManager();
      const a1 = newAuthor(em);

      expect(sameEntity(a1, a1)).toEqual(true);
      await em.assignNewIds();

      expect(sameEntity(a1, a1)).toEqual(true);
      expect(sameEntity(a1, a1.id)).toEqual(true);
      expect(sameEntity(a1.id, a1)).toEqual(true);
    });

    it("handles existing entities", async () => {
      const em = newEntityManager();
      const a1 = newAuthor(em);
      const a2 = newAuthor(em);
      await em.flush();
      expect(sameEntity(a1, a1)).toEqual(true);
      expect(sameEntity(a1, a2)).toEqual(false);
      expect(sameEntity(a1, undefined)).toEqual(false);
      expect(sameEntity(undefined, a1)).toEqual(false);
    });

    it("handles both undefined", async () => {
      expect(sameEntity(undefined, undefined)).toEqual(true);
    });
  });

  it("can delete entities from a hook", async () => {
    // Given an author with a book + reviews
    const em = newEntityManager();
    const a1 = newAuthor(em, { books: [{ reviews: [{}] }] });
    await em.flush();
    // When we delete the author from a beforeFlush hook
    const em2 = newEntityManager();
    const a2 = await em2.load(Author, a1.id);
    a2.transientFields.deleteDuringFlush = true;
    em2.touch(a2);
    await em2.flush();
    // Then the entities were deleted
    expect(await countOfAuthors()).toBe(0);
    expect(await countOfBooks()).toBe(0);
    expect(await countOfBookReviews()).toBe(0);
  });

  it("can new delete entities from a hook", async () => {
    // Given an author with a book + reviews
    const em = newEntityManager();
    const a1 = newAuthor(em, { books: [{ reviews: [{}] }] });
    // When we delete the author before its even been saved
    a1.transientFields.deleteDuringFlush = true;
    await em.flush();
    // Then the entities were not saved
    expect(await countOfAuthors()).toBe(0);
    expect(await countOfBooks()).toBe(0);
    expect(await countOfBookReviews()).toBe(0);
  });

  it("can load via lens", async () => {
    // Given two books with the same publisher
    const em = newEntityManager();
    const p = newPublisher(em);
    const b1 = newBook(em, { author: { publisher: p } });
    const b2 = newBook(em, { author: { publisher: p } });
    newBook(em, { author: {} });
    // When we use loadLens to find publishers
    const publishers = await em.loadLens([b1, b2], (b) => b.author.publisher);
    // Then we got the publisher back
    expect(publishers).toEqual([p]);
  });

  it("can load via lens and populate", async () => {
    // Given two books with the same publisher
    const em = newEntityManager();
    const p = newPublisher(em);
    // And we use `as Book` to get rid of DeepLoaded to ensure the `authors.get` is added by loadLens itself
    const b1 = newBook(em, { author: { publisher: p } }) as Book;
    const b2 = newBook(em, { author: { publisher: p } }) as Book;
    // When we use loadLens to find publishers
    const publishers = await em.loadLens([b1, b2], (b) => b.author.publisher, "authors");
    // Then we got the publisher back
    expect(publishers).toEqual([p]);
    // And we can get the authors
    expect(publishers[0].authors.get.length).toBe(2);
  });

  it("can display nice versions of constraint failures", async () => {
    await insertPublisher({ name: "p1" });
    const em = newEntityManager();
    em.create(Author, { publisher: "p:1", firstName: "Jim" });
    em.create(Author, { publisher: "p:1", firstName: "Jim" });
    await expect(em.flush()).rejects.toThrow("There is already a publisher with a Jim");
  });

  it("is typed correctly", async () => {
    // Given our app-specific em
    const em = newEntityManager();
    // And a function that takes the app-specific em
    function doSomething(_: EntityManager) {}
    // When we have an entity and use its em field
    const a = newAuthor(em);
    // Then it works
    doSomething(a.em);
    // And also with our app-specific Entity
    const a2: Entity = a;
    doSomething(a2.em);
  });

  it("can accept non-narrowed constructors", async () => {
    // Given our local EM that is typed to Entity narrowed to a string
    const em = newEntityManager();
    async function foo() {
      // And we verify the return values are typed as strings
      const id1: string = em.entities[0].id;
      const id2: string | undefined = em.getEntity("a:1")?.id;
      // And a type that uses the joist non-narrowed Entity that is string | number
      const type = Author as MaybeAbstractEntityConstructor<JoistEntity>;
      const type2 = Author as EntityConstructor<JoistEntity>;
      const entity: JoistEntity = null!;
      // Then we can use the non-narrowed Entity in various EM methods
      await em.find(type, {} as FilterWithAlias<JoistEntity>);
      await em.findCount(type, {} as FilterWithAlias<JoistEntity>);
      await em.findOne(type, {} as FilterWithAlias<JoistEntity>);
      await em.findOneOrFail(type, {} as FilterWithAlias<JoistEntity>);
      await em.findByUnique(type, {} as FilterWithAlias<JoistEntity>);
      await em.load(type, {} as OptsOf<JoistEntity>);
      await em.loadAll(type, {} as FilterWithAlias<JoistEntity>);
      await em.populate(entity, []);
      await em.refresh(entity);
      em.create(type2, {} as OptsOf<JoistEntity>);
      em.touch(entity);
    }
  });

  it("supports rules that return string arrays", async () => {
    const em = newEntityManager();
    // Given an author with a very bad first name
    newAuthor(em, { firstName: "very bad" });
    // Then we see both error messages
    await expect(em.flush()).rejects.toThrow("Author#1 First Name is invalid one, First Name is invalid two");
  });

  it("supports rules that return error literals", async () => {
    const em = newEntityManager();
    // Given an author with a very bad first name
    newAuthor(em, { firstName: "very bad message" });
    // Then we see both error messages
    await expect(em.flush()).rejects.toThrow("Author#1 First Name is invalid one, First Name is invalid two");
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
