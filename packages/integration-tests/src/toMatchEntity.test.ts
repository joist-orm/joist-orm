import { alignedAnsiStyleSerializer } from "@src/alignedAnsiStyleSerializer";
import { newAuthor, newBook, newPublisher } from "@src/entities";
import { newEntityManager } from "./setupDbTests";

expect.addSnapshotSerializer(alignedAnsiStyleSerializer as any);

describe("toMatchEntity", () => {
  it("can match primitive fields", async () => {
    const em = newEntityManager();
    const p1 = newPublisher(em);
    await em.flush();
    await expect(p1).toMatchEntity({ name: "Publisher 1" });
  });

  it("can match references", async () => {
    const em = newEntityManager();
    const b1 = newBook(em);
    await em.flush();
    await expect(b1).toMatchEntity({ author: { firstName: "a1" } });
  });

  it("can match async properties", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { books: [{}, {}] });
    await em.flush();
    await expect(a1).toMatchEntity({ numberOfBooks2: 2 });
  });

  it("can match persisted async properties", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { books: [{}, {}] });
    await em.flush();
    await expect(a1).toMatchEntity({ numberOfBooks: 2 });
  });

  it("can match reference with entity directly", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const b1 = newBook(em, { author: a1 });
    await em.flush();
    await expect(b1).toMatchEntity({ author: a1 });
  });

  it("can fail match reference with wrong entity", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const a2 = newAuthor(em);
    const b1 = newBook(em, { author: a1 });
    await em.flush();
    await expect(expect(b1).toMatchEntity({ author: a2 })).rejects.toThrowErrorMatchingInlineSnapshot(`
expect(received).toMatchObject(expected)

- Expected  - 1
+ Received  + 1

  Object {
-   "author": "a:2",
+   "author": "a:1",
  }
`);
  });

  it("can fail match reference with undefined", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const a2 = newAuthor(em);
    const b1 = newBook(em, { author: a1 });
    await em.flush();
    await expect(expect(b1).toMatchEntity({ author: undefined })).rejects.toThrowErrorMatchingInlineSnapshot(`
expect(received).toMatchObject(expected)

- Expected  - 1
+ Received  + 3

  Object {
-   "author": undefined,
+   "author": Object {
+     "id": "a:1",
+   },
  }
`);
  });

  it("can match collections", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { books: [{}, {}] });
    await em.flush();
    await expect(a1).toMatchEntity({
      books: [{ title: "title" }, { title: "title" }],
    });
  });

  it("can match collections of the entity itself", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { books: [{}, {}] });
    const b1 = a1.books.get[0];
    await em.flush();
    await expect(a1).toMatchEntity({
      books: [b1, { title: "title" }],
    });
  });

  it("can fail with missing entity in collection", async () => {
    const em = newEntityManager();
    // Given an author with two books
    const a1 = newAuthor(em, { books: [{}, {}] });
    const b2 = a1.books.get[1];
    await em.flush();
    // Then it fails if we assert against only one
    await expect(expect(a1).toMatchEntity({ books: [b2] })).rejects.toThrowErrorMatchingInlineSnapshot(`
expect(received).toMatchObject(expected)

- Expected  - 0
+ Received  + 1

  Object {
    "books": Array [
+     "b:1",
      "b:2",
    ],
  }
`);
  });

  it("can fail with extra entity in collection", async () => {
    const em = newEntityManager();
    // Given an author with one book
    const a1 = newAuthor(em, { books: [{}] });
    const b1 = a1.books.get[0];
    // And an extra book
    const b2 = newBook(em, { author: {} });
    await em.flush();
    // Then it fails if we include the extra book
    await expect(expect(a1).toMatchEntity({ books: [b1, b2] })).rejects.toThrowErrorMatchingInlineSnapshot(`
expect(received).toMatchObject(expected)

- Expected  - 1
+ Received  + 0

  Object {
    "books": Array [
      "b:1",
-     "b:2",
    ],
  }
`);
  });

  it("can fail with missing new entity in collection", async () => {
    const em = newEntityManager();
    // Given an author with two books
    const a1 = newAuthor(em, { books: [{}, {}] });
    const b2 = a1.books.get[1];
    // And we don't flush
    // Then it fails if we assert against only one
    await expect(expect(a1).toMatchEntity({ books: [b2] })).rejects.toThrowErrorMatchingInlineSnapshot(`
expect(received).toMatchObject(expected)

- Expected  - 0
+ Received  + 1

  Object {
    "books": Array [
+     "b#1",
      "b#2",
    ],
  }
`);
  });

  it("is strongly typed", async () => {
    const em = newEntityManager();
    const p1 = newPublisher(em);
    // @ts-expect-error
    await expect(expect(p1).toMatchEntity({ name2: "name" })).rejects.toThrow();
  });

  it("is strongly typed within collections", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    // @ts-expect-error
    await expect(expect(a1).toMatchEntity({ books: [{ title2: "name" }] })).rejects.toThrow();
  });

  it("is strongly typed within references", async () => {
    const em = newEntityManager();
    const b1 = newBook(em);
    // @ts-expect-error
    await expect(expect(b1).toMatchEntity({ author: { firstName2: "name" } })).rejects.toThrow();
  });
});
