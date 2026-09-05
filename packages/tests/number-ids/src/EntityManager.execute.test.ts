import { KeySerde, alias } from "joist-orm";
import { Author, Book } from "src/entities";
import { newEntityManager, select } from "src/setupDbTests";

describe("EntityManager.execute with number ids", () => {
  it.each(["known", "unknown"] as const)("round-trips public PK/FK ids with %s output codecs", async (codec) => {
    // Given Author integer ids and Book bigint ids exposed as public numbers
    const em = newEntityManager();
    const a = alias(Author);
    const b = alias(Book);
    // And PostgreSQL needs explicit timestamps in this fixture, despite Joist's omission convention
    const timestamp = new Date("2026-01-02T03:04:05.000Z");
    // And an unknown output codec must not change the public id representation
    const outputType =
      codec === "unknown" ? jest.spyOn(KeySerde.prototype, "outputType", "get").mockReturnValue(undefined) : undefined;
    try {
      // When inserting an Author with scalar PK RETURNING
      const author = await em.execute({
        insert: a,
        values: { firstName: "Owner", createdAt: timestamp, updatedAt: timestamp },
        returning: a.id,
      });
      // Then the Author id is a number rather than an internal tagged string
      expect(author).toEqual({ rowCount: 1, rows: [1] });

      // When assigning the returned Author id to a Book foreign key
      const book = await em.execute({
        insert: b,
        values: { title: "Imported", author: author.rows[0], createdAt: timestamp, updatedAt: timestamp },
        returning: { id: b.id, author: b.author, createdAt: b.createdAt, updatedAt: b.updatedAt },
      });
      // Then POJO RETURNING decodes both the bigint PK and integer FK as numbers
      expect(book).toEqual({ rowCount: 1, rows: [{ id: 1, author: 1, createdAt: timestamp, updatedAt: timestamp }] });
      expect(await select("books")).toMatchObject([
        { id: "1", author_id: 1, created_at: timestamp, updated_at: timestamp },
      ]);
      expect(em.entities).toEqual([]);

      // When reassigning the returned FK and filtering by the returned PK
      const updated = await em.execute({
        update: b,
        set: { author: book.rows[0].author },
        where: b.id.eq(book.rows[0].id),
        returning: b.author,
      });
      // Then scalar FK RETURNING also exposes a public Author id
      expect(updated).toEqual({ rowCount: 1, rows: [1] });

      // When deleting the Book and returning its keys
      const deleted = await em.execute({
        delete: b,
        where: b.id.eq(book.rows[0].id),
        returning: { id: b.id, author: b.author },
      });
      // Then DELETE uses the same public PK/FK representation
      expect(deleted).toEqual({ rowCount: 1, rows: [{ id: 1, author: 1 }] });
      expect(await select("books")).toEqual([]);

      // When reinserting the returned PK and FK without converting either value
      const restored = await em.execute({
        insert: b,
        values: { ...deleted.rows[0], title: "Restored", createdAt: timestamp, updatedAt: timestamp },
        returning: b.id,
      });
      // Then scalar bigint PK RETURNING remains numeric
      expect(restored).toEqual({ rowCount: 1, rows: [1] });
      expect(await select("books")).toMatchObject([{ id: "1", author_id: 1, title: "Restored" }]);

      // When hydrating the restored Book through its internal tagged id
      const loaded = await em.load(Book, "b:1");
      // Then entity hydration retains tagged internal keys and public numeric ids
      expect(loaded).toMatchEntity({ id: 1, title: "Restored" });
      expect(loaded.author.id).toBe(1);
      expect(loaded.idTagged).toBe("b:1");
      expect(loaded.author.idTaggedMaybe).toBe("a:1");
    } finally {
      outputType?.mockRestore();
    }
  });

  it.each(["createdAt", "updatedAt"] as const)("lets PostgreSQL enforce Author.%s without a trigger", async (field) => {
    // Given an Author import with every required SQL value
    const em = newEntityManager();
    const a = alias(Author);
    const values = {
      firstName: "Missing timestamp",
      createdAt: new Date("2026-01-02T03:04:05.000Z"),
      updatedAt: new Date("2026-01-02T03:04:05.000Z"),
    };
    // And one timestamp is omitted even though its column has no default or trigger
    // When omitting a conventional timestamp, the mutation compiler allows PostgreSQL to enforce the schema
    const result = em.execute({ insert: a, values: { ...values, [field]: undefined } });
    // Then PostgreSQL rejects the missing value without inserting an Author
    await expect(result).rejects.toThrow(
      `null value in column "${field === "createdAt" ? "created_at" : "updated_at"}"`,
    );
    expect(await select("authors")).toEqual([]);
  });
});
