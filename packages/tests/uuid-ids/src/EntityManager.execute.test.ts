import { type InsertValues, KeySerde, table } from "joist-orm";
import { Author, Book, BookStatus } from "src/entities";
import { newEntityManager, select } from "src/setupDbTests";

describe("EntityManager.execute with tagged UUID ids", () => {
  it.each(["known", "unknown"] as const)("round-trips public PK/FK ids with %s output codecs", async (codec) => {
    // Given Author and Book UUID ids exposed with their entity tags
    const em = newEntityManager();
    const a = table(Author);
    const b = table(Book);
    // And UUIDs have no SQL default, while PostgreSQL needs explicit timestamps in this fixture
    const authorId = "a:20000000-0000-0000-0000-000000000001";
    const bookId = "b:20000000-0000-0000-0000-000000000002";
    const timestamp = new Date("2026-01-02T03:04:05.000Z");
    // And an unknown output codec must retain the correct PK and FK entity tags
    const outputType =
      codec === "unknown" ? jest.spyOn(KeySerde.prototype, "outputType", "get").mockReturnValue(undefined) : undefined;
    try {
      // When inserting an Author with scalar PK RETURNING
      const author = await em.execute({
        insert: a,
        values: { id: authorId, first_name: "Owner", created_at: timestamp, updated_at: timestamp },
        returning: a.id,
      });
      // Then the scalar Author id retains its public tag
      expect(author).toEqual({ rowCount: 1, rows: [authorId] });

      // When assigning the returned Author id and the physically required status to a Book
      const book = await em.execute({
        insert: b,
        values: {
          id: bookId,
          title: "Imported",
          author_id: author.rows[0],
          status_id: BookStatus.Draft,
          created_at: timestamp,
          updated_at: timestamp,
        },
        returning: {
          id: b.id,
          author: b.author_id,
          status: b.status_id,
          createdAt: b.created_at,
          updatedAt: b.updated_at,
        },
      });
      // Then POJO RETURNING uses the Book tag for its PK and the Author tag for its FK
      expect(book).toEqual({
        rowCount: 1,
        rows: [{ id: bookId, author: authorId, status: BookStatus.Draft, createdAt: timestamp, updatedAt: timestamp }],
      });
      expect(await select("books")).toMatchObject([
        {
          id: "20000000-0000-0000-0000-000000000002",
          author_id: "20000000-0000-0000-0000-000000000001",
          status_id: "00000000-0000-0000-0000-000000000001",
          created_at: timestamp,
          updated_at: timestamp,
        },
      ]);
      expect(em.entities).toEqual([]);

      // When reassigning the returned FK and filtering by the returned PK
      const updated = await em.execute({
        update: b,
        set: { author_id: book.rows[0].author },
        where: b.id.eq(book.rows[0].id),
        returning: b.author_id,
      });
      // Then scalar FK RETURNING retains the Author tag rather than the Book tag
      expect(updated).toEqual({ rowCount: 1, rows: [authorId] });

      // When deleting the Book and returning its keys
      const deleted = await em.execute({
        delete: b,
        where: b.id.eq(book.rows[0].id),
        returning: { id: b.id, author: b.author_id },
      });
      // Then DELETE uses the same public PK/FK representation
      expect(deleted).toEqual({ rowCount: 1, rows: [{ id: bookId, author: authorId }] });
      expect(await select("books")).toEqual([]);

      // When reinserting the returned PK and FK without converting either value
      const restored = await em.execute({
        insert: b,
        values: {
          id: deleted.rows[0].id,
          author_id: deleted.rows[0].author,
          title: "Restored",
          status_id: book.rows[0].status,
          created_at: timestamp,
          updated_at: timestamp,
        },
        returning: b.id,
      });
      // Then scalar Book PK RETURNING remains tagged
      expect(restored).toEqual({ rowCount: 1, rows: [bookId] });
      expect(await select("books")).toMatchObject([
        {
          id: "20000000-0000-0000-0000-000000000002",
          author_id: "20000000-0000-0000-0000-000000000001",
          title: "Restored",
        },
      ]);

      // When hydrating the restored Book through its tagged id
      const loaded = await em.load(Book, bookId);
      // Then entity hydration keeps the same tagged internal and public keys
      expect(loaded).toMatchEntity({ id: bookId, title: "Restored" });
      expect(loaded.author.id).toBe(authorId);
      expect(loaded.idTagged).toBe(bookId);
      expect(loaded.author.idTaggedMaybe).toBe(authorId);
    } finally {
      outputType?.mockRestore();
    }
  });

  it.each(["id", "created_at", "updated_at"] as const)("enforces Author.%s at the appropriate layer", async (field) => {
    // Given an Author import with every required SQL value
    const em = newEntityManager();
    const a = table(Author);
    const values: Partial<InsertValues<Author>> = {
      id: "a:20000000-0000-0000-0000-000000000001",
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
    expect(await select("authors")).toEqual([]);
  });
});
