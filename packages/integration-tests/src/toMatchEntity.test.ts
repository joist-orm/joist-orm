import { alignedAnsiStyleSerializer } from "@src/alignedAnsiStyleSerializer";
import { Author, Book, newAuthor, newBook } from "@src/entities";
import { jan1 } from "joist-orm";
import { newEntityManager } from "./setupDbTests";

expect.addSnapshotSerializer(alignedAnsiStyleSerializer as any);

describe("toMatchEntity", () => {
  it("can match primitive fields", async () => {
    const em = newEntityManager();
    const p1 = newAuthor(em, { firstName: "Author 1" });
    await em.flush();
    expect(p1).toMatchEntity({ firstName: "Author 1" });
  });

  it("can match references", async () => {
    const em = newEntityManager();
    const b1 = newBook(em);
    await em.flush();
    expect(b1).toMatchEntity({ author: { firstName: "a1" } });
  });

  it("can match entity", async () => {
    const em = newEntityManager();
    const b1 = newBook(em);
    await em.flush();
    expect(b1).toMatchEntity(b1);
  });

  it("can match loaded references", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, {});
    const b1 = newBook(em, {});
    const expected: Array<Book | Author> = [a1, b1];
    const a2 = await a1.populate("books");
    const b2 = await b1.populate("author");
    expect(expected).toMatchEntity([a2, b2]);
  });

  it("can match collections with soft-deleted entities", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { books: [{ deletedAt: jan1 }] });
    await em.flush();
    expect(a1).toMatchEntity({ books: [{ deletedAt: jan1 }] });
  });

  it("can match async properties", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { books: [{}, {}] });
    await em.flush();
    expect(a1).toMatchEntity({ numberOfBooks2: 2 });
  });

  it("can match persisted async properties", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { books: [{}, {}] });
    await em.flush();
    expect(a1).toMatchEntity({ numberOfBooks: 2 });
  });

  it("can match reference with entity directly", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const b1 = newBook(em, { author: a1 });
    await em.flush();
    expect(b1).toMatchEntity({ author: a1 });
  });

  it("can fail match reference with wrong entity", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    const a2 = newAuthor(em);
    const b1 = newBook(em, { author: a1 });
    await em.flush();
    expect(() => expect(b1).toMatchEntity({ author: a2 })).toThrowErrorMatchingInlineSnapshot(`
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
    expect(() => expect(b1).toMatchEntity({ author: undefined })).toThrowErrorMatchingInlineSnapshot(`
      expect(received).toMatchObject(expected)

      - Expected  - 1
      + Received  + 1

        Object {
      -   "author": undefined,
      +   "author": "a:1",
        }
    `);
  });

  it("can match collections", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { books: [{}, {}] });
    await em.flush();
    expect(a1).toMatchEntity({
      books: [{ title: "title" }, { title: "title" }],
    });
  });

  it("can match collections of the entity itself", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { books: [{}, {}] });
    const b1 = a1.books.get[0];
    await em.flush();
    expect(a1).toMatchEntity({
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
    expect(() => expect(a1).toMatchEntity({ books: [b2] })).toThrowErrorMatchingInlineSnapshot(`
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
    expect(() => expect(a1).toMatchEntity({ books: [b1, b2] })).toThrowErrorMatchingInlineSnapshot(`
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
    expect(() => expect(a1).toMatchEntity({ books: [b2] })).toThrowErrorMatchingInlineSnapshot(`
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

  it("can fail with missing entity in pojo", async () => {
    const em = newEntityManager();
    // Given an author with two books
    const a1 = newAuthor(em, { books: [{}, {}] });
    const b2 = a1.books.get[1];
    // And an assertion against a POJO of author + a list of books, but the actual doesn't have any books
    expect(() =>
      expect({
        author: a1,
        books: [] as Array<{ bestSelling: Book }>,
      }).toMatchEntity({
        author: a1,
        // So because the actual array is [],
        books: [{ bestSelling: b2 }],
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      expect(received).toMatchObject(expected)

      - Expected  - 5
      + Received  + 1

        Object {
          "author": "a#1",
      -   "books": Array [
      -     Object {
      -       "bestSelling": "b#2",
      -     },
      -   ],
      +   "books": Array [],
        }
    `);
  });

  it("is strongly typed", async () => {
    const em = newEntityManager();
    const p1 = newAuthor(em);
    // @ts-expect-error
    expect(() => expect(p1).toMatchEntity({ firstName2: "name" })).toThrow();
  });

  it("is strongly typed within collections", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em);
    // @ts-expect-error
    expect(() => expect(a1).toMatchEntity({ books: [{ title2: "firstName" }] })).toThrow();
  });

  it("is strongly typed within references", async () => {
    const em = newEntityManager();
    const b1 = newBook(em);
    // @ts-expect-error
    expect(() => expect(b1).toMatchEntity({ author: { firstfirstName2: "name" } })).toThrow();
  });

  it("can match object literals", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { firstName: "a1" });
    const res = {
      author: a1,
      author2: a1 as Author | null,
      author3: a1 as Author | null | undefined,
      author4: a1,
      authors: [a1],
      authors2: [a1] as readonly Author[],
      authors3: [a1] as readonly Author[] | null,
      authors4: [a1] as ReadonlyArray<Author | undefined>,
      authors5: [a1] as ReadonlyArray<Author | undefined | null>,
      authors6: [a1] as ReadonlyArray<Author | undefined | null>,
    };
    expect(res).toMatchEntity({
      author: { firstName: "a1" },
      author2: { firstName: "a1" },
      author3: { firstName: "a1" },
      author4: {},
      authors: [{ firstName: "a1" }],
      authors2: [{ firstName: "a1" }],
      authors3: [{ firstName: "a1" }],
      authors4: [{ firstName: "a1" }],
      authors5: [{ firstName: "a1" }],
      authors6: [{}],
    });
    expect(res).toMatchEntity({
      author: a1,
      author2: a1,
      author3: a1,
      author4: {},
      authors: [a1],
      authors2: [a1],
      authors3: [a1],
      authors4: [a1],
      authors5: [a1],
      authors6: [a1],
    });
  });

  it("can match partial object literals", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { firstName: "a1" });
    const res = {
      author1: a1,
      author2: a1,
      authors1: { author1: a1, author2: a1 },
      authors2: [{ author1: a1, author2: a1 }],
    };
    expect(res).toMatchEntity({
      author1: { firstName: "a1" },
      authors1: { author1: { firstName: "a1" } },
      authors2: [{ author1: { firstName: "a1" } }],
    });
    expect(res).toMatchEntity({
      author1: a1,
      authors1: { author1: a1 },
      authors2: [{ author1: a1 }],
    });
  });

  it("can match arrays", async () => {
    const em = newEntityManager();
    const a1 = newAuthor(em, { firstName: "a1" });
    const a2 = newAuthor(em, { firstName: "a1" });
    const res = [{ author1: a1 }];
    expect(res).toMatchEntity([{ author1: a1 }]);
    expect([a1, a2]).toMatchEntity([a1, a2]);
    expect(() => expect([a1, a2]).toMatchEntity([a2, a1])).toThrowErrorMatchingInlineSnapshot(`
      expect(received).toMatchObject(expected)

      - Expected  - 1
      + Received  + 1

        Array [
      -   "a#2",
          "a#1",
      +   "a#2",
        ]
    `);
    expect(() => expect([a1, a2]).toMatchEntity([a1])).toThrowErrorMatchingInlineSnapshot(`
      expect(received).toMatchObject(expected)

      - Expected  - 0
      + Received  + 1

        Array [
          "a#1",
      +   "a#2",
        ]
    `);
    expect(() => expect([a1]).toMatchEntity([a1, a2])).toThrowErrorMatchingInlineSnapshot(`
      expect(received).toMatchObject(expected)

      - Expected  - 1
      + Received  + 0

        Array [
          "a#1",
      -   "a#2",
        ]
    `);
    expect(() => expect([] as any).toMatchEntity([{ author1: a1 }])).toThrowErrorMatchingInlineSnapshot(`
      expect(received).toMatchObject(expected)

      - Expected  - 5
      + Received  + 1

      - Array [
      -   Object {
      -     "author1": "a#1",
      -   },
      - ]
      + Array []
    `);
  });
});
