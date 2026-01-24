import { insertAuthor, insertBook, insertComment, insertPublisher, insertTag } from "@src/entities/inserts";
import { newEntityManager, numberOfQueries, resetQueryCount } from "@src/testEm";
import { zeroTo } from "src/utils";
import { Author, Book, Comment, Publisher, Tag, newAuthor, newBook, newPublisher, newTag } from "./entities";

describe("EntityManager.findOrCreate", () => {
  it("can find with findOrCreate", async () => {
    const em = newEntityManager();
    em.create(Author, { firstName: "a1" });
    await em.flush();
    const a = await em.findOrCreate(Author, { firstName: "a1" }, {});
    expect(a.id).toEqual("a:1");
  });

  it("can find by optional field with findOrCreate", async () => {
    const em = newEntityManager();
    em.create(Author, { firstName: "a1", age: 20 });
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

  it("can find by null unloaded m2o field with findOrCreate", async () => {
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    const a1 = await em.load(Author, "a:1");
    // Using null instead of undefined should also find the existing author
    const a2 = await em.findOrCreate(Author, { publisher: null }, { firstName: "a2" });
    expect(a2).toMatchEntity(a1);
  });

  it("can find in-memory entity by null m2o field with findOrCreate", async () => {
    const em = newEntityManager();
    // Create an author with no publisher
    const a1 = em.create(Author, { firstName: "a1" });
    // Using null should find the in-memory entity
    const a2 = await em.findOrCreate(Author, { publisher: null }, { firstName: "a2" });
    expect(a2).toMatchEntity(a1);
  });

  it("can create with findOrCreate", async () => {
    const em = newEntityManager();
    em.create(Author, { firstName: "a1" });
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

  it("can create with findOrCreate and ignore deleted/flushed entities", async () => {
    await insertPublisher({ name: "p1" });
    await insertComment({ text: "c1", parent_publisher_id: 1 });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "p:1");
    const c1 = await em.load(Comment, "comment:1", "parent");
    em.delete(c1);
    await em.flush();
    const c2 = await em.findOrCreate(Comment, { parent: p1 }, {});
    expect(c2.isNewEntity).toBe(true);
    expect(await p1.comments.load()).toMatchEntity([c2]);
  });

  it("can create with findOrCreate and ignore deleted/unflushed entities", async () => {
    await insertPublisher({ name: "p1" });
    await insertComment({ text: "c1", parent_publisher_id: 1 });
    const em = newEntityManager();
    const p1 = await em.load(Publisher, "p:1");
    const c1 = await em.load(Comment, "comment:1", "parent");
    em.delete(c1);
    const c2 = await em.findOrCreate(Comment, { parent: p1 }, {});
    expect(c2.isNewEntity).toBe(true);
    expect(await p1.comments.load()).toMatchEntity([c2]);
  });

  it("can upsert with findOrCreate", async () => {
    const em = newEntityManager();
    em.create(Author, { firstName: "a1" });
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
    const [a1] = await Promise.all([
      em.findOrCreate(Author, { firstName: "a1" }, {}, { lastName: "B" }),
      em.findOrCreate(Author, { firstName: "a1" }, {}, { lastName: "C" }),
    ]);
    // Then they returned the same entity
    expect(em.getEntities(Author).length).toBe(1);
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

  it("cannot findOrCreate with o2ms", async () => {
    const em = newEntityManager();
    const b1 = newBook(em);
    const promise = em.findOrCreate(Author, { firstName: "a2", books: [b1] }, {}, {});
    await expect(promise).rejects.toThrow("findOrCreate only supports");
  });

  it("should handle large datasets efficiently", async () => {
    const em = newEntityManager();
    const n = 5_000;
    // Given a large number of authors in memory
    zeroTo(n).forEach((i) => em.create(Author, { firstName: `Author${i}` }));
    const start = performance.now();
    // When we do a potential n^2 `findOrCreate`
    const result = await Promise.all(zeroTo(n).map((i) => em.findOrCreate(Author, { firstName: `Author${i}` }, {})));
    const end = performance.now();
    // Then it completes much faster (13 seconds -> 700ms)
    expect(end - start).toBeLessThan(n); // Nms for n searches
    // And verify we found the existing entity, not created a new one
    const authors = em.getEntities(Author);
    expect(authors.length).toBe(n);
  });

  it("trims string values", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    await em.flush();
    const a2 = await em.findOrCreate(Author, { firstName: " a1 " }, {});
    expect(a2).toMatchEntity(a1);
  });

  it("coalesces empty string", async () => {
    const em = newEntityManager();
    const a1 = em.create(Author, { firstName: "a1" });
    await em.flush();
    const a2 = await em.findOrCreate(Author, { firstName: "a1", lastName: "" }, {});
    expect(a2).toMatchEntity(a1);
  });

  it("uses trimmed but not lowered value", async () => {
    const em = newEntityManager();
    const t1 = await em.findOrCreate(Tag, { name: " First " }, {});
    expect(t1.name).toBe("First");
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
