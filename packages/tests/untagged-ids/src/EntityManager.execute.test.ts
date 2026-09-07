import { type InsertValues, KeySerde, setTaggedIdDelimiter, table } from "joist-orm";
import { Author, Book, BookReview } from "src/entities";
import { knex, newEntityManager } from "src/setupDbTests";

describe("EntityManager.execute with untagged ids", () => {
  it.each(["known", "unknown"] as const)("round-trips public PK/FK ids with %s output codecs", async (codec) => {
    // Given Author and Book UUID ids exposed without entity tags
    const em = newEntityManager();
    const a = table(Author);
    const b = table(Book);
    // And UUIDs have no SQL default, while PostgreSQL needs explicit timestamps in this fixture
    const authorId = "20000000-0000-0000-0000-000000000001";
    const bookId = "20000000-0000-0000-0000-000000000002";
    const timestamp = new Date("2026-01-02T03:04:05.000Z");
    // And an unknown output codec must not expose internal tagged ids
    const outputType =
      codec === "unknown" ? jest.spyOn(KeySerde.prototype, "outputType", "get").mockReturnValue(undefined) : undefined;
    try {
      // When inserting an Author with scalar PK RETURNING
      const author = await em.execute({
        insert: a,
        values: { id: authorId, first_name: "Owner", created_at: timestamp, updated_at: timestamp },
        returning: a.id,
      });
      // Then the scalar Author id has no internal tag
      expect(author).toEqual({ rowCount: 1, rows: [authorId] });

      // When assigning the returned Author id to a Book foreign key
      const book = await em.execute({
        insert: b,
        values: {
          id: bookId,
          title: "Imported",
          author_id: author.rows[0],
          created_at: timestamp,
          updated_at: timestamp,
        },
        returning: { id: b.id, author: b.author_id, createdAt: b.created_at, updatedAt: b.updated_at },
      });
      // Then POJO RETURNING removes the Book PK tag and the Author FK tag
      expect(book).toEqual({
        rowCount: 1,
        rows: [{ id: bookId, author: authorId, createdAt: timestamp, updatedAt: timestamp }],
      });
      expect(await knex.select("*").from("books")).toMatchObject([
        { id: bookId, author_id: authorId, created_at: timestamp, updated_at: timestamp },
      ]);
      expect(em.entities).toEqual([]);

      // When reassigning the returned FK and filtering by the returned PK
      const updated = await em.execute({
        update: b,
        set: { author_id: book.rows[0].author },
        where: b.id.eq(book.rows[0].id),
        returning: b.author_id,
      });
      // Then scalar FK RETURNING also exposes an untagged Author id
      expect(updated).toEqual({ rowCount: 1, rows: [authorId] });

      // When deleting the Book and returning its keys
      const deleted = await em.execute({
        delete: b,
        where: b.id.eq(book.rows[0].id),
        returning: { id: b.id, author: b.author_id },
      });
      // Then DELETE uses the same public PK/FK representation
      expect(deleted).toEqual({ rowCount: 1, rows: [{ id: bookId, author: authorId }] });
      expect(await knex.select("*").from("books")).toEqual([]);

      // When reinserting the returned PK and FK without converting either value
      const restored = await em.execute({
        insert: b,
        values: {
          id: deleted.rows[0].id,
          author_id: deleted.rows[0].author,
          title: "Restored",
          created_at: timestamp,
          updated_at: timestamp,
        },
        returning: b.id,
      });
      // Then scalar Book PK RETURNING remains untagged
      expect(restored).toEqual({ rowCount: 1, rows: [bookId] });
      expect(await knex.select("*").from("books")).toMatchObject([
        { id: bookId, author_id: authorId, title: "Restored" },
      ]);

      // When hydrating the restored Book through its internal tagged id
      const loaded = await em.load(Book, `b:${bookId}`);
      // Then entity hydration retains tagged internal keys and public untagged ids
      expect(loaded).toMatchEntity({ id: bookId, title: "Restored" });
      expect(loaded.author.id).toBe(authorId);
      expect(loaded.idTagged).toBe(`b:${bookId}`);
      expect(loaded.author.idTaggedMaybe).toBe(`a:${authorId}`);
    } finally {
      outputType?.mockRestore();
    }
  });

  it.each([
    [":", "br:customer"],
    [":", "a:customer"],
    [":", "customer:branch:region"],
    [undefined, "brown"],
    [undefined, "br123"],
  ] as const)("preserves the public TEXT id %s / %s through assignments", async (delimiter, id) => {
    // Given BookReview TEXT ids exposed without tags, even when their text resembles an internal id
    const em = newEntityManager();
    const a = table(Author);
    const br = table(BookReview);
    // And the empty configured delimiter uses the runtime's no-separator mode
    setTaggedIdDelimiter(delimiter);
    try {
      // And BookReview.book references an existing UUID Author, not a Book or another BookReview
      const author = await em.execute({
        insert: a,
        values: {
          id: "20000000-0000-0000-0000-000000000001",
          first_name: "Owner",
          created_at: new Date("2026-01-02T03:04:05.000Z"),
          updated_at: new Date("2026-01-02T03:04:05.000Z"),
        },
        returning: a.id,
      });
      // When inserting a BookReview with its complete public TEXT id and the returned Author FK
      const inserted = await em.execute({
        insert: br,
        values: { id, rating: 1, book_id: author.rows[0] },
        returning: { id: br.id, book: br.book_id },
      });
      // Then storage and POJO RETURNING preserve every character of the TEXT PK and UUID FK
      expect(inserted).toEqual({ rowCount: 1, rows: [{ id, book: author.rows[0] }] });
      expect(await knex.select("*").from("book_reviews")).toMatchObject([
        { id, book_id: "20000000-0000-0000-0000-000000000001", rating: 1 },
      ]);
      expect(await em.query({ from: br, select: br.id })).toEqual([id]);

      // And the persisted Author's public id getter must not be used for an entity assignment
      const owner = await em.findOneOrFail(Author, { firstName: "Owner" });
      const publicId = jest.spyOn(owner, "id", "get").mockImplementation(() => {
        throw new Error("Entity assignments must use idTaggedMaybe");
      });
      try {
        // When assigning the persisted Author rather than its public id
        const updated = await em.execute({
          update: br,
          set: { book_id: owner, rating: 2 },
          where: br.rating.eq(1),
          returning: { id: br.id, book: br.book_id },
        });
        // Then the entity's internal tagged FK reaches the codec without retagging its public value
        expect(updated).toEqual({ rowCount: 1, rows: [{ id, book: author.rows[0] }] });
      } finally {
        publicId.mockRestore();
      }

      // When deleting the BookReview and returning its keys for reuse
      const deleted = await em.execute({
        delete: br,
        where: br.rating.eq(2),
        returning: { id: br.id, book: br.book_id },
      });
      // Then DELETE also preserves the public TEXT PK and UUID FK
      expect(deleted).toEqual({ rowCount: 1, rows: [{ id, book: author.rows[0] }] });
      expect(await knex.select("*").from("book_reviews")).toEqual([]);

      // When assigning the returned PK and FK directly to a replacement BookReview
      const restored = await em.execute({
        insert: br,
        values: { id: deleted.rows[0].id, book_id: deleted.rows[0].book, rating: 3 },
        returning: br.id,
      });
      // Then scalar RETURNING, public reads, and physical storage retain the original TEXT id
      expect(restored).toEqual({ rowCount: 1, rows: [id] });
      expect(await em.query({ from: br, select: { id: br.id, book: br.book_id } })).toEqual([
        { id, book: author.rows[0] },
      ]);
      expect(await knex.select("*").from("book_reviews")).toMatchObject([
        { id, book_id: "20000000-0000-0000-0000-000000000001", rating: 3 },
      ]);
    } finally {
      setTaggedIdDelimiter(":");
    }
  });

  it.each(["id", "created_at", "updated_at"] as const)("enforces Author.%s at the appropriate layer", async (field) => {
    // Given an Author import with every required SQL value
    const em = newEntityManager();
    const a = table(Author);
    const values: Partial<InsertValues<Author>> = {
      id: "20000000-0000-0000-0000-000000000001",
      first_name: "Missing value",
      created_at: new Date("2026-01-02T03:04:05.000Z"),
      updated_at: new Date("2026-01-02T03:04:05.000Z"),
    };
    // And one required column is omitted despite having no SQL default or trigger
    delete values[field];
    // When executing an incomplete import without ORM id or timestamp generation
    // @ts-expect-error Partial values cannot guarantee the required UUID and first_name
    const result = em.execute({ insert: a, values });
    // Then Joist requires the UUID, while PostgreSQL enforces omitted conventional timestamps
    await expect(result).rejects.toThrow(
      field === "id" ? "INSERT requires Author.id" : `null value in column "${field}"`,
    );
    expect(await knex.select("*").from("authors")).toEqual([]);
  });
});
