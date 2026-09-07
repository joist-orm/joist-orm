import { type ColumnCondition, type Entity, type ExecuteResult, getMetadata, query, sql, table } from "joist-orm";
import {
  AdminUser,
  Author,
  AuthorStat,
  Book,
  BookRange,
  Color,
  Comment,
  FavoriteShape,
  LargePublisher,
  Publisher,
  SmallPublisher,
  Tag,
  Task,
  TaskNew,
  TaskOld,
  User,
  newUser,
} from "src/entities";
import { insertAuthor, insertBook, insertTag, insertUser, select, update } from "src/entities/inserts";
import { PasswordValue, PasswordValueSerde } from "src/entities/types";
import { knex, newEntityManager, queries, resetQueryCount } from "src/testEm";
import { ZodError } from "zod";

describe("EntityManager.execute", () => {
  it("round-trips native numeric AuthorStat arrays through VALUES, SELECT, and UPDATE", async () => {
    // Given an AuthorStat import with fractional samples and bigint samples beyond Number's exact range
    const em = newEntityManager();
    const s = table(AuthorStat);
    const returning = { decimal: s.decimal_samples, bigint: s.bigint_samples };
    // When inserting domain arrays through the generated codecs
    const inserted = await em.execute({
      insert: s,
      values: {
        smallint: 1,
        integer: 1,
        bigint: 1n,
        decimal: 1.5,
        real: 1.5,
        double_precision: 1.5,
        decimal_samples: [0, 1.25, 2.5],
        bigint_samples: [0n, 9007199254740993n],
      },
      returning,
    });
    // Then RETURNING decodes array elements without scalar coercion or precision loss
    expect(inserted.rows).toEqual([{ decimal: [0, 1.25, 2.5], bigint: [0n, 9007199254740993n] }]);
    expect(await select("author_stats")).toMatchObject([
      { decimal_samples: [0, 1.25, 2.5], bigint_samples: ["0", "9007199254740993"] },
    ]);
    // When copying the real array columns entirely inside PostgreSQL
    const copied = await em.execute({
      insert: s,
      from: {
        from: s,
        select: {
          smallint: s.smallint,
          integer: s.integer,
          bigint: s.bigint,
          decimal: s.decimal,
          real: s.real,
          double_precision: s.double_precision,
          decimal_samples: s.decimal_samples,
          bigint_samples: s.bigint_samples,
        },
      },
      returning,
    });
    // Then native array storage remains compatible with its generated domain fields
    expect(copied.rows).toEqual(inserted.rows);
    // When replacing both arrays with empty arrays
    const empty = await em.execute({
      update: s,
      set: { decimal_samples: [], bigint_samples: [] },
      allowAll: true,
      returning,
    });
    // Then empty arrays remain arrays rather than SQL NULL
    expect(empty.rows).toEqual([
      { decimal: [], bigint: [] },
      { decimal: [], bigint: [] },
    ]);
    // When clearing the nullable physical columns
    const cleared = await em.execute({
      update: s,
      set: { decimal_samples: null, bigint_samples: null },
      allowAll: true,
      returning,
    });
    // Then SQL NULL remains distinct from empty arrays
    expect(cleared.rows).toEqual([
      { decimal: null, bigint: null },
      { decimal: null, bigint: null },
    ]);
  });

  it("returns generated PasswordValue array elements from real User password history", async () => {
    // Given a User whose password history is written by the generated custom array serde during flush
    const em = newEntityManager();
    const password = PasswordValue.fromPlainText("previous password");
    const user = newUser(em, { passwordHistory: [password] });
    await em.flush();
    // And User's inherited family supplies a scalar subquery, not a mutation target
    const u = table(User);
    const t = table(Tag);
    const history = query({ from: u, where: u.id.eq(user.id), select: u.password_history });
    // When a Tag mutation returns the stored password history
    const inserted = await em.execute({ insert: t, values: { name: "Password audit" }, returning: history });
    // Then each returned element is the domain object, not its encoded text
    expect(inserted.rows).toEqual([[password]]);
    expect(inserted.rows[0]![0].matches("previous password")).toBe(true);
    expect(await select("users")).toMatchObject([{ password_history: [password.encoded], bio: "" }]);
    // And an empty password history is stored through the same generated entity setter
    user.passwordHistory = [];
    await em.flush();
    // When returning the empty array through a named projection
    const empty = await em.execute({
      update: t,
      set: { name: "Empty history" },
      allowAll: true,
      returning: { history },
    });
    // Then the array is preserved without inventing an element
    expect(empty.rows).toEqual([{ history: [] }]);
    // And the optional history is now absent rather than an empty array
    user.passwordHistory = undefined;
    await em.flush();
    // When deleting the audit Tag with scalar RETURNING
    const cleared = await em.execute({ delete: t, allowAll: true, returning: history });
    // Then SQL NULL bypasses the custom element decoder
    expect(cleared.rows).toEqual([null]);
  });

  describe("INSERT VALUES", () => {
    it("leaves generated search storage and a falsy default to PostgreSQL", async () => {
      // Given an Author import that omits isFunny and the generated ts_search column
      const em = newEntityManager();
      const a = table(Author);
      // When writing search without running the ORM's derived-field reactions
      const inserted = await em.execute({
        insert: a,
        values: { first_name: "Importer", number_of_books: 0, search: "catalog" },
        returning: { isFunny: a.is_funny, bookComments: a.book_comments },
      });
      // Then the SQL false default and physically nullable derived storage retain their values
      expect(inserted.rows).toEqual([{ isFunny: false, bookComments: null }]);
      expect(await select("authors")).toMatchObject([{ ts_search: "'catalog':1" }]);
      // When backfilling the ordinary persisted search field
      await em.execute({ update: a, set: { search: "history" }, allowAll: true });
      // Then PostgreSQL recomputes the generated column without ORM hooks
      expect(await select("authors")).toMatchObject([{ ts_search: "'histori':1" }]);
    });

    it("inserts one Book with an explicit id, database defaults, and trigger timestamps", async () => {
      // Given a persisted Author that can own the imported Book
      await insertAuthor({ first_name: "Importer" });
      // And the explicit-id import marks Books for this fixture's sequence-based cleanup
      await knex.raw("SELECT nextval('books_id_seq')");
      const em = newEntityManager();
      const b = table(Book);
      resetQueryCount();
      // When inserting a Book without ORM defaults or timestamp assignments
      const result = await em.execute({
        insert: b,
        values: { id: "b:10", title: "Imported", author_id: "a:1", notes: "Explicit notes" },
        returning: {
          id: b.id,
          title: b.title,
          author: b.author_id,
          order: b.order,
          createdAt: b.created_at,
          updatedAt: b.updated_at,
        },
      });
      // Then PostgreSQL supplies the order and timestamps without hydrating a Book
      expect(result.rowCount).toBe(1);
      expect(result.rows).toEqual([
        {
          id: "b:10",
          title: "Imported",
          author: "a:1",
          order: 1,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        },
      ]);
      expect(em.entities).toEqual([]);
      expect(queries).toMatchInlineSnapshot(`
        [
          "INSERT INTO books AS b (id, title, notes, author_id) VALUES ($1, $2, $3, $4) RETURNING b.id AS id, b.title AS title, b.author_id AS author, b.\"order\" AS \"order\", b.created_at AS \"createdAt\", b.updated_at AS \"updatedAt\"",
        ]
      `);
      expect(await select("books")).toMatchObject([
        { id: 10, author_id: 1, notes: "Explicit notes", search: null, authors_nick_names: null },
      ]);
    });

    it("uses a common bulk column list with omission, undefined, and explicit per-row DEFAULT", async () => {
      // Given a persisted Author for four Books with different assignment keys
      await insertAuthor({ first_name: "Importer" });
      const em = newEntityManager();
      const b = table(Book);
      resetQueryCount();
      // When only the first Book supplies acknowledgements and a nondefault order
      const result = await em.execute({
        insert: b,
        values: [
          { title: "Explicit", author_id: "a:1", notes: "n1", order: 9, acknowledgements: "Thanks" },
          { notes: "n2", author_id: "a:1", title: "Undefined", order: undefined, acknowledgements: undefined },
          { author_id: "a:1", title: "Omitted", notes: "n3" },
          { title: "Default", author_id: "a:1", notes: "n4", order: sql<number>`DEFAULT`, acknowledgements: null },
        ],
        returning: { title: b.title, order: b.order, acknowledgements: b.acknowledgements },
      });
      // Then each omitted cell uses its SQL default rather than another row's value or SQL NULL
      expect(result).toEqual({
        rowCount: 4,
        rows: [
          { title: "Explicit", order: 9, acknowledgements: "Thanks" },
          { title: "Undefined", order: 1, acknowledgements: null },
          { title: "Omitted", order: 1, acknowledgements: null },
          { title: "Default", order: 1, acknowledgements: null },
        ],
      });
      expect(queries).toMatchInlineSnapshot(`
        [
          "INSERT INTO books AS b (title, \"order\", notes, acknowledgements, author_id) VALUES ($1, $2, $3, $4, $5), ($6, DEFAULT, $7, DEFAULT, $8), ($9, DEFAULT, $10, DEFAULT, $11), ($12, DEFAULT, $13, NULL, $14) RETURNING b.title AS title, b.\"order\" AS \"order\", b.acknowledgements AS acknowledgements",
        ]
      `);
    });

    it("returns the native bulk INSERT count without RETURNING", async () => {
      // Given an empty Tag table and a fresh EntityManager
      const em = newEntityManager();
      const t = table(Tag);
      // When inserting two Tags without asking PostgreSQL to return rows
      const result = await em.execute({ insert: t, values: [{ name: "History" }, { name: "Science" }] });
      // Then the command count does not depend on the returned row array
      expect(result).toEqual({ rowCount: 2, rows: [] });
      expect(await select("tags")).toMatchObject([{ name: "History" }, { name: "Science" }]);
    });

    it("reuses frozen statement POJOs and returns scalar ids", async () => {
      // Given a frozen Tag statement that must not acquire aliases or normalized values
      const em = newEntityManager();
      const t = table(Tag);
      const statement = Object.freeze({ insert: t, values: Object.freeze({ name: "Reusable" }), returning: t.id });
      // When executing the same statement twice
      const first = await em.execute(statement);
      // And a second execution inserts another Tag rather than reusing a hydrated entity
      const second = await em.execute(statement);
      // Then each execution returns its own scalar id and leaves the input unchanged
      expect(first).toEqual({ rowCount: 1, rows: ["t:1"] });
      expect(second).toEqual({ rowCount: 1, rows: ["t:2"] });
      expect(statement.values).toEqual({ name: "Reusable" });
      expect(Object.keys(statement)).toEqual(["insert", "values", "returning"]);
      expect(em.entities).toEqual([]);
    });

    it("returns an empty envelope without SQL for an empty VALUES array", async () => {
      // Given an empty list of imported Books, which need no required-field values
      const em = newEntityManager();
      const b = table(Book);
      // When executing the empty import with a valid scalar RETURNING
      const result = await em.execute({ insert: b, values: [], returning: b.id });
      // Then no SQL or entity work is needed
      expect(result).toEqual({ rowCount: 0, rows: [] });
      expect(queries).toEqual([]);
      expect(em.entities).toEqual([]);
    });

    it("accepts persisted reference entities and tagged ids in the same INSERT", async () => {
      // Given two persisted Authors whose ids use the Author codec
      await insertAuthor({ first_name: "Owner" });
      // And another Author can review the imported Books
      await insertAuthor({ first_name: "Reviewer" });
      const em = newEntityManager();
      // And the first Author is already loaded, not a new entity with an id
      const owner = await em.load(Author, "a:1");
      const b = table(Book);
      // When assigning references as both entities and ids
      const result = await em.execute({
        insert: b,
        values: [
          { title: "Entity owner", author_id: owner, reviewer_id: "a:2", notes: "Imported" },
          { title: "Id owner", author_id: "a:2", reviewer_id: owner, notes: "Imported" },
        ],
        returning: { author: b.author_id, reviewer: b.reviewer_id },
      });
      // Then each reference is encoded as a foreign key and decoded as an Author id
      expect(result).toEqual({
        rowCount: 2,
        rows: [
          { author: "a:1", reviewer: "a:2" },
          { author: "a:2", reviewer: "a:1" },
        ],
      });
      expect(await select("books")).toMatchObject([
        { author_id: 1, reviewer_id: 2 },
        { author_id: 2, reviewer_id: 1 },
      ]);
      expect(em.entities).toEqual([owner]);
    });

    it("lets PostgreSQL validate an id-only foreign key without creating an Author", async () => {
      // Given an Author id with no corresponding persisted row
      const em = newEntityManager();
      const b = table(Book);
      // When importing a Book that references the missing Author
      const result = em.execute({ insert: b, values: { title: "Orphan", author_id: "a:999", notes: "Imported" } });
      // Then the database foreign-key constraint rejects the write without ORM fixups
      await expect(result).rejects.toMatchObject({ code: "23503" });
      expect(await select("books")).toEqual([]);
      expect(await select("authors")).toEqual([]);
    });

    it("permits a scalar subquery with its own INSERT source scope", async () => {
      // Given a persisted Tag whose name can be copied by a scalar subquery
      await insertTag({ name: "Source" });
      const em = newEntityManager();
      const t = table(Tag);
      // And the subquery uses the same alias handle in its own lexical source, not the new target row
      const name = query({ from: t, where: t.id.eq("t:1"), select: t.name }).coalesce("Fallback");
      resetQueryCount();
      // When using that scalar expression in VALUES
      const result = await em.execute({ insert: t, values: { name }, returning: t.name });
      // Then the source is evaluated inside PostgreSQL and RETURNING refers to the inserted row
      expect(result).toEqual({ rowCount: 1, rows: ["Source"] });
      expect(queries).toMatchInlineSnapshot(`
        [
          "INSERT INTO tags AS t (name) VALUES (coalesce((SELECT t1.name AS value FROM tags AS t1 WHERE t1.id = $1), $2)) RETURNING t.name AS value",
        ]
      `);
    });
  });

  describe("UPDATE and DELETE", () => {
    it("updates arithmetic expressions in target scope while pruning undefined assignments", async () => {
      // Given an Author with two Books whose orders differ
      await insertAuthor({ first_name: "Owner" });
      // And the first Book is the only row selected for arithmetic
      await insertBook({ title: "First", author_id: 1, order: 4 });
      // And the second Book must retain its order
      await insertBook({ title: "Second", author_id: 1, order: 8 });
      const em = newEntityManager();
      const b = table(Book);
      resetQueryCount();
      // When incrementing the first Book's order and omitting its title
      const result = await em.execute({
        update: b,
        set: { order: sql<number>`${b.order} + ${3}`, title: undefined },
        where: { and: [b.id.eq("b:1"), b.title.eq(undefined)] },
        returning: b.order,
      });
      // Then SET and RETURNING see the target row, and the unused filter and title are pruned
      expect(result).toEqual({ rowCount: 1, rows: [7] });
      expect(queries).toMatchInlineSnapshot(`
        [
          "UPDATE books AS b SET \"order\" = b.\"order\" + $1 WHERE (b.id = $2) AND (b.deleted_at IS NULL) RETURNING b.\"order\" AS value",
        ]
      `);
      expect(await select("books")).toMatchObject([
        { title: "First", order: 7 },
        { title: "Second", order: 8 },
      ]);
    });

    it("backfills persisted derived columns without hooks, reactions, validation, or cache repair", async () => {
      // Given an Author with an intentionally stale persisted book count
      await insertAuthor({ first_name: "Original", number_of_books: 0 });
      const em = newEntityManager();
      // And the Author is loaded before SQL changes its stored values
      const loaded = await em.load(Author, "a:1");
      // And an unflushed Author must not be inserted as a side effect of execute
      const pending = em.create(Author, { firstName: "Pending" });
      const a = table(Author);
      resetQueryCount();
      // When importing derived values and a name that violates the first-name/last-name entity rule
      const result = await em.execute({
        update: a,
        set: {
          first_name: "Same",
          last_name: "Same",
          initials: "BACKFILL",
          number_of_books: 42,
          numberOfPublicReviews2: 7,
        },
        where: a.id.eq("a:1"),
        returning: { initials: a.initials, count: a.number_of_books, publicReviews: a.numberOfPublicReviews2 },
      });
      // Then physical derived fields are writable without recalculation or identity-map synchronization
      expect(result).toEqual({ rowCount: 1, rows: [{ initials: "BACKFILL", count: 42, publicReviews: 7 }] });
      expect(queries).toMatchInlineSnapshot(`
        [
          "UPDATE authors AS a SET first_name = $1, last_name = $2, initials = $3, number_of_books = $4, \"numberOfPublicReviews2\" = $5 WHERE (a.id = $6) AND (a.deleted_at IS NULL) RETURNING a.initials AS initials, a.number_of_books AS \"count\", a.\"numberOfPublicReviews2\" AS \"publicReviews\"",
        ]
      `);
      expect(loaded.firstName).toBe("Original");
      expect(loaded.transientFields.beforeUpdateRan).toBe(false);
      expect(loaded.transientFields.numberOfBooksCalcInvoked).toBe(0);
      expect(loaded.transientFields.firstIsNotLastNameRuleInvoked).toBe(0);
      expect(pending.isNewEntity).toBe(true);
      expect(
        await newEntityManager().query({
          from: a,
          select: { name: a.first_name, initials: a.initials, count: a.number_of_books },
        }),
      ).toEqual([{ name: "Same", initials: "BACKFILL", count: 42 }]);
    });

    it("counts all matched UPDATE rows without RETURNING and supports SQL DEFAULT", async () => {
      // Given two Authors with explicitly backfilled initials
      await insertAuthor({ first_name: "First", initials: "ONE" });
      // And a second Author also differs from the database's initials default
      await insertAuthor({ first_name: "Second", initials: "TWO" });
      const em = newEntityManager();
      const a = table(Author);
      // When explicitly allowing all live Authors and resetting their initials to the SQL default
      const result = await em.execute({ update: a, set: { initials: sql<string>`DEFAULT` }, allowAll: true });
      // Then the command count remains nonzero despite the absence of RETURNING
      expect(result).toEqual({ rowCount: 2, rows: [] });
      expect(await select("authors")).toMatchObject([{ initials: "..." }, { initials: "..." }]);
    });

    it.each([undefined, "exclude", "include"] as const)(
      "applies UPDATE softDeletes=%s without removing an allowAll predicate",
      async (softDeletes) => {
        // Given a live Author selected by the user predicate
        await insertAuthor({ first_name: "Selected", age: 10 });
        // And a deleted Author has the same name but is visible only with include
        await insertAuthor({ first_name: "Selected", age: 20, deleted_at: new Date("2020-01-01") });
        // And another live Author must remain outside the user predicate even with allowAll
        await insertAuthor({ first_name: "Other", age: 30 });
        const em = newEntityManager();
        const a = table(Author);
        // When updating selected Authors under the requested soft-delete policy
        const result = await em.execute({
          update: a,
          set: { age: 50 },
          where: a.first_name.eq("Selected"),
          allowAll: true,
          softDeletes,
        });
        // Then allowAll preserves the user's predicate and the metadata soft-delete policy
        expect(result).toEqual({ rowCount: softDeletes === "include" ? 2 : 1, rows: [] });
        expect(await select("authors")).toMatchObject([
          { age: 50 },
          { age: softDeletes === "include" ? 50 : 20 },
          { age: 30 },
        ]);
      },
    );

    it("physically deletes live Authors by default and returns deleted POJOs", async () => {
      // Given a live Author that may be physically deleted
      await insertAuthor({ first_name: "Live" });
      // And an already soft-deleted Author must remain under the default policy
      await insertAuthor({ first_name: "Deleted", deleted_at: new Date("2020-01-01") });
      const em = newEntityManager();
      const a = table(Author);
      resetQueryCount();
      // When explicitly deleting all visible Authors
      const result = await em.execute({ delete: a, allowAll: true, returning: { id: a.id, name: a.first_name } });
      // Then DELETE removes the live row instead of setting its deleted_at
      expect(result).toEqual({ rowCount: 1, rows: [{ id: "a:1", name: "Live" }] });
      expect(queries).toMatchInlineSnapshot(`
        [
          "DELETE FROM authors AS a WHERE (a.deleted_at IS NULL) RETURNING a.id AS id, a.first_name AS name",
        ]
      `);
      expect(await select("authors")).toMatchObject([
        { id: 2, first_name: "Deleted", deleted_at: new Date("2020-01-01") },
      ]);
    });

    it("physically deletes soft-deleted rows with include and returns scalar ids", async () => {
      // Given an already soft-deleted Author selected for physical removal
      await insertAuthor({ first_name: "Deleted", deleted_at: new Date("2020-01-01") });
      // And an unrelated live Author must survive the explicit predicate
      await insertAuthor({ first_name: "Live" });
      const em = newEntityManager();
      const a = table(Author);
      // When deleting the soft-deleted Author with include and allowAll
      const result = await em.execute({
        delete: a,
        where: a.id.eq("a:1"),
        allowAll: true,
        softDeletes: "include",
        returning: a.id,
      });
      // Then RETURNING contains the removed id and allowAll has not erased the predicate
      expect(result).toEqual({ rowCount: 1, rows: ["a:1"] });
      expect(await select("authors")).toMatchObject([{ id: 2, first_name: "Live" }]);
    });

    it("returns a nonzero physical DELETE count without RETURNING", async () => {
      // Given two Tags eligible for physical deletion
      await insertTag({ name: "First" });
      // And a second Tag contributes independently to the command count
      await insertTag({ name: "Second" });
      const em = newEntityManager();
      const t = table(Tag);
      // When a user explicitly supplies a true SQL predicate rather than an omitted guard
      const result = await em.execute({ delete: t, where: sql<boolean>`true` });
      // Then the command reports both removed rows even without returned data
      expect(result).toEqual({ rowCount: 2, rows: [] });
      expect(await select("tags")).toEqual([]);
    });

    it("retains database foreign-key constraints during physical DELETE", async () => {
      // Given an Author referenced by a persisted Book
      await insertAuthor({ first_name: "Owner" });
      // And the Book's required foreign key prevents removing its Author
      await insertBook({ title: "Retained", author_id: 1 });
      const em = newEntityManager();
      const a = table(Author);
      // When execute tries physical deletion instead of invoking ORM relationship handling
      const result = em.execute({ delete: a, where: a.id.eq("a:1") });
      // Then PostgreSQL rejects the deletion and both physical rows remain
      await expect(result).rejects.toMatchObject({ code: "23503" });
      expect(await select("authors")).toMatchObject([{ id: 1 }]);
      expect(await select("books")).toMatchObject([{ id: 1, author_id: 1 }]);
    });

    it.each(["update", "delete"] as const)(
      "returns a zero-row %s count with and without RETURNING",
      async (operation) => {
        // Given one Tag outside the requested id predicate
        await insertTag({ name: "Retained" });
        const em = newEntityManager();
        const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
        const t = table(Tag);
        const statement =
          operation === "update"
            ? { update: t, set: { name: "Changed" }, where: t.id.eq("t:999") }
            : { delete: t, where: t.id.eq("t:999") };
        // When executing a statement that cannot match the stored Tag
        const withoutReturning = await execute(statement);
        // And asking the same unmatched statement for scalar RETURNING does not create rows
        const withReturning = await execute({ ...statement, returning: t.id });
        // Then both command counts and row arrays are empty, while the Tag is untouched
        expect(withoutReturning).toEqual({ rowCount: 0, rows: [] });
        expect(withReturning).toEqual({ rowCount: 0, rows: [] });
        expect(await select("tags")).toMatchObject([{ id: 1, name: "Retained" }]);
      },
    );
  });

  describe("INSERT SELECT", () => {
    it("rejects physical enum-array copying before SQL", async () => {
      // Given an Author source and target with the same physical enum-array field
      const em = newEntityManager();
      const a = table(Author);
      // When copying the array whose element decoder rejects null enum ids
      await expect(
        em.execute({
          insert: a,
          from: {
            from: a,
            select: {
              first_name: a.first_name,
              number_of_books: a.number_of_books,
              favorite_colors: a.favorite_colors,
            },
          },
        }),
      ).rejects.toThrow("INSERT SELECT Author.favorite_colors has incompatible or unknown storage codecs");
      // Then no SQL runs for this unsupported codec
      expect(queries).toEqual([]);
    });

    it.each([false, true])("accepts a named one-column read with reusable query value=%s", async (reusable) => {
      // Given three Tags that make source filtering, ordering, and pagination observable
      await insertTag({ name: "Alpha" });
      // And Beta is the second matching row after the source sort
      await insertTag({ name: "Beta" });
      // And Gamma must not be copied after the source limit
      await insertTag({ name: "Gamma" });
      const em = newEntityManager();
      const source = table(Tag);
      const target = table(Tag);
      // And the source exposes the target's physical column name rather than a scalar projection
      const read = {
        from: source,
        where: source.name.ne("Missing"),
        select: { name: source.name },
        orderBy: [{ asc: source.name }],
        offset: 1,
        limit: 1,
      };
      resetQueryCount();
      // When INSERT consumes the read POJO or its reusable query value directly
      const result = await em.execute({ insert: target, from: reusable ? query(read) : read, returning: target.name });
      // Then one source row is inserted with its ordering and bindings intact
      expect(result).toEqual({ rowCount: 1, rows: ["Beta"] });
      expect(queries).toMatchInlineSnapshot(`
          [
            "INSERT INTO tags AS t (name) SELECT sq.name FROM (SELECT t.name AS name FROM tags AS t WHERE t.name != $1 ORDER BY t.name ASC LIMIT $2 OFFSET $3) AS sq RETURNING t.name AS value",
          ]
        `);
    });

    it("normalizes reordered UNION ALL keys without deduplicating source rows", async () => {
      // Given an Author and a Book whose required fields can be copied entirely in SQL
      await insertAuthor({ first_name: "Owner" });
      // And the source Book supplies a title, notes, and its Author foreign key
      await insertBook({ title: "Copied", author_id: 1 });
      const em = newEntityManager();
      const source = table(Book);
      const target = table(Book);
      // And the second UNION ALL branch deliberately orders its named output keys differently
      const copies = query({
        unionAll: [
          {
            from: source,
            where: source.id.eq("b:1"),
            select: { notes: source.notes, author_id: source.author_id, title: source.title },
          },
          {
            from: source,
            where: source.title.eq("Copied"),
            select: { title: source.title, notes: source.notes, author_id: source.author_id },
          },
        ],
        orderBy: [{ title: "ASC" }],
        limit: 2,
      });
      resetQueryCount();
      // When using the reusable compound as the INSERT source
      const result = await em.execute({
        insert: target,
        from: copies,
        returning: { title: target.title, author: target.author_id, notes: target.notes },
      });
      // Then both duplicate rows survive and each source key reaches its correct physical column
      expect(result).toEqual({
        rowCount: 2,
        rows: [
          { title: "Copied", author: "a:1", notes: "notes" },
          { title: "Copied", author: "a:1", notes: "notes" },
        ],
      });
      expect(queries).toMatchInlineSnapshot(`
       [
         "INSERT INTO books AS b (title, notes, author_id) SELECT sq.title, sq.notes, sq.author_id FROM ((SELECT b.notes AS notes, b.author_id AS author_id, b.title AS title FROM books AS b WHERE b.id = $1 AND b.deleted_at IS NULL) UNION ALL (SELECT sq.notes AS notes, sq.author_id AS author_id, sq.title AS title FROM (SELECT b1.title AS title, b1.notes AS notes, b1.author_id AS author_id FROM books AS b1 WHERE b1.title = $2 AND b1.deleted_at IS NULL) AS sq) ORDER BY title ASC LIMIT $3) AS sq RETURNING b.title AS title, b.author_id AS author, b.notes AS notes",
       ]
      `);
      expect(await select("books")).toMatchObject([
        { title: "Copied", author_id: 1, notes: "notes" },
        { title: "Copied", author_id: 1, notes: "notes" },
        { title: "Copied", author_id: 1, notes: "notes" },
      ]);
    });

    it("copies schema-backed JSON without source decoding or target value encoding", async () => {
      // Given an Author address with an extra key that its real Zod decoder would strip
      await insertAuthor({ first_name: "Source", business_address: { street: "Main", imported: true } });
      const em = newEntityManager();
      const source = table(Author);
      const target = table(Author);
      // And both directions of the actual schema-backed column codec are observed after fixture setup
      const column = getMetadata(Author).fields.businessAddress.serde!.columns[0];
      const decode = jest.spyOn(column, "mapFromDb");
      const encode = jest.spyOn(column, "mapToDbValue");
      const read = jest.spyOn(em, "query");
      resetQueryCount();
      try {
        // When INSERT SELECT copies the address and returns only the new id
        const result = await em.execute({
          insert: target,
          from: query({
            from: source,
            select: {
              business_address: source.business_address,
              number_of_books: source.number_of_books,
              first_name: source.first_name,
            },
          }),
          returning: target.id,
        });
        // Then no JavaScript read or address codec runs between the SQL stages
        expect(result).toEqual({ rowCount: 1, rows: ["a:2"] });
        expect(read).not.toHaveBeenCalled();
        expect(decode).not.toHaveBeenCalled();
        expect(encode).not.toHaveBeenCalled();
        expect(queries).toMatchInlineSnapshot(`
         [
           "INSERT INTO authors AS a (first_name, number_of_books, business_address) SELECT sq.first_name, sq.number_of_books, sq.business_address FROM (SELECT a.business_address AS business_address, a.number_of_books AS number_of_books, a.first_name AS first_name FROM authors AS a WHERE a.deleted_at IS NULL) AS sq RETURNING a.id AS value",
         ]
        `);
        expect(await select("authors")).toMatchObject([
          { business_address: { street: "Main", imported: true } },
          { business_address: { street: "Main", imported: true } },
        ]);
      } finally {
        read.mockRestore();
        decode.mockRestore();
        encode.mockRestore();
      }
    });

    it("copies invalid persisted JSON without invoking a source decoder", async () => {
      // Given an Author address deliberately containing a numeric street that AddressSchema rejects
      await insertAuthor({ first_name: "Source", business_address: { street: 123 } });
      const em = newEntityManager();
      const source = table(Author);
      const target = table(Author);
      // When copying the schema-backed JSON column directly between SQL stages
      const result = await em.execute({
        insert: target,
        from: {
          from: source,
          select: {
            business_address: source.business_address,
            number_of_books: source.number_of_books,
            first_name: source.first_name,
          },
        },
      });
      // Then the invalid JSON remains a database value and does not fail a JavaScript round trip
      expect(result).toEqual({ rowCount: 1, rows: [] });
      expect(await select("authors")).toMatchObject([
        { business_address: { street: 123 } },
        { business_address: { street: 123 } },
      ]);
    });

    it("returns a zero INSERT count when its SQL source has no rows", async () => {
      // Given an empty source Tag table
      const em = newEntityManager();
      const source = table(Tag);
      const target = table(Tag);
      resetQueryCount();
      // When a valid INSERT SELECT evaluates an empty source rather than an empty VALUES shortcut
      const result = await em.execute({
        insert: target,
        from: { from: source, select: { name: source.name } },
        returning: target.id,
      });
      // Then PostgreSQL executes one statement and reports zero affected rows
      expect(result).toEqual({ rowCount: 0, rows: [] });
      expect(queries).toMatchInlineSnapshot(`
        [
          "INSERT INTO tags AS t (name) SELECT sq.name FROM (SELECT t.name AS name FROM tags AS t) AS sq RETURNING t.id AS value",
        ]
      `);
      // When the same empty source is executed without RETURNING
      const withoutReturning = await em.execute({
        insert: target,
        from: { from: source, select: { name: source.name } },
      });
      // Then omitting RETURNING preserves the zero affected-row count
      expect(withoutReturning).toEqual({ rowCount: 0, rows: [] });
    });

    it("uses a named compound column in an UPDATE predicate without mutation joins", async () => {
      // Given two Tags, only one of which the compound selects
      await insertTag({ name: "Selected" });
      // And the second Tag is outside both compound branches
      await insertTag({ name: "Retained" });
      const em = newEntityManager();
      const source = table(Tag);
      const target = table(Tag);
      // And the compound's named ids are wrapped in an ordinary scalar query for IN
      const ids = query({
        unionAll: [
          { from: source, where: source.name.eq("Selected"), select: { id: source.id } },
          { from: source, where: source.id.eq("t:999"), select: { id: source.id } },
        ],
      });
      resetQueryCount();
      // When the UPDATE predicate consumes the compound's compatible Tag ids
      const result = await em.execute({
        update: target,
        set: { name: "Changed" },
        where: target.id.in(query({ from: ids, select: ids.id })),
        returning: target.id,
      });
      // Then only the selected Tag is updated and the compound stays inside SQL
      expect(result).toEqual({ rowCount: 1, rows: ["t:1"] });
      expect(queries).toMatchInlineSnapshot(`
        [
          "UPDATE tags AS t SET name = $1 WHERE (t.id IN (SELECT sq.id AS value FROM ((SELECT t1.id AS id FROM tags AS t1 WHERE t1.name = $2) UNION ALL (SELECT t2.id AS id FROM tags AS t2 WHERE t2.id = $3)) AS sq)) RETURNING t.id AS value",
        ]
      `);
      expect(await select("tags")).toMatchObject([{ name: "Changed" }, { name: "Retained" }]);
    });
  });

  describe("native codecs and RETURNING", () => {
    it("encodes and returns enums, enum arrays, JSON, native arrays, bigint, and dates", async () => {
      // Given a fresh Author import with real domain values rather than raw database enum ids
      const em = newEntityManager();
      const a = table(Author);
      const graduated = new Date("2020-01-02T00:00:00.000Z");
      // When writing the supported native and schema-backed fields without an entity setter
      const result = await em.execute({
        insert: a,
        values: {
          first_name: "Codecs",
          number_of_books: 0,
          range_of_books: BookRange.Few,
          favorite_colors: [Color.Red, Color.Green],
          favorite_shape: FavoriteShape.Triangle,
          nick_names: ["One", "Two"],
          address: { street: "Home" },
          business_address: { street: "Work" },
          quotes: ["First", "Second"],
          number_of_atoms: 9007199254740993n,
          graduated,
        },
        returning: {
          range: a.range_of_books,
          colors: a.favorite_colors,
          shape: a.favorite_shape,
          nickNames: a.nick_names,
          address: a.address,
          businessAddress: a.business_address,
          quotes: a.quotes,
          atoms: a.number_of_atoms,
          graduated: a.graduated,
        },
      });
      // Then RETURNING uses the same column decoders as reads without hydrating an Author
      expect(result).toEqual({
        rowCount: 1,
        rows: [
          {
            range: BookRange.Few,
            colors: [Color.Red, Color.Green],
            shape: FavoriteShape.Triangle,
            nickNames: ["One", "Two"],
            address: { street: "Home" },
            businessAddress: { street: "Work" },
            quotes: ["First", "Second"],
            atoms: 9007199254740993n,
            graduated,
          },
        ],
      });
      expect(await select("authors")).toMatchObject([
        {
          range_of_books: 1,
          favorite_colors: [1, 2],
          favorite_shape: "triangle",
          nick_names: ["One", "Two"],
          quotes: ["First", "Second"],
          number_of_atoms: "9007199254740993",
        },
      ]);
      expect(em.entities).toEqual([]);
    });

    it("distinguishes SQL NULL, JSON null, and empty enum arrays in physical storage", async () => {
      // Given three Author rows that will distinguish absent SQL values from JSON and array values
      const em = newEntityManager();
      const a = table(Author);
      // When inserting SQL NULL, a JSON null expression, and concrete empty arrays separately
      const result = await em.execute({
        insert: a,
        values: [
          {
            first_name: "SQL null",
            number_of_books: 0,
            address: null,
            business_address: null,
            favorite_colors: null,
            quotes: null,
          },
          { first_name: "JSON null", number_of_books: 0, address: sql<null>`'null'::jsonb`, favorite_colors: [] },
          {
            first_name: "Values",
            number_of_books: 0,
            address: { street: "Main" },
            favorite_colors: [Color.Blue],
            quotes: [],
          },
        ],
        returning: { address: a.address, colors: a.favorite_colors, quotes: a.quotes },
      });
      // Then null bypasses schema and enum codecs, while SQL still distinguishes the two kinds of null
      expect(result).toEqual({
        rowCount: 3,
        rows: [
          { address: null, colors: null, quotes: null },
          { address: null, colors: [], quotes: null },
          { address: { street: "Main" }, colors: [Color.Blue], quotes: [] },
        ],
      });
      expect(
        await knex("authors")
          .select(
            "first_name",
            knex.raw("address IS NULL AS sql_null"),
            knex.raw("address = 'null'::jsonb AS json_null"),
            "favorite_colors",
            "quotes",
          )
          .orderBy("id"),
      ).toEqual([
        { first_name: "SQL null", sql_null: true, json_null: null, favorite_colors: null, quotes: null },
        { first_name: "JSON null", sql_null: false, json_null: true, favorite_colors: [], quotes: null },
        { first_name: "Values", sql_null: false, json_null: false, favorite_colors: [3], quotes: [] },
      ]);
    });

    it("preserves scalar enum-array RETURNING instead of wrapping or defaulting SQL NULL", async () => {
      // Given an Author whose colors are initially concrete enum values
      await insertAuthor({ first_name: "Colors", favorite_colors: [1, 2] });
      const em = newEntityManager();
      const a = table(Author);
      // When replacing the enum array with an empty domain array
      const empty = await em.execute({
        update: a,
        set: { favorite_colors: [] },
        where: a.id.eq("a:1"),
        returning: a.favorite_colors,
      });
      // And a subsequent UPDATE explicitly stores SQL NULL rather than the enum-array default
      const absent = await em.execute({
        update: a,
        set: { favorite_colors: null },
        where: a.id.eq("a:1"),
        returning: a.favorite_colors,
      });
      // Then scalar results retain their array/null identity
      expect(empty).toEqual({ rowCount: 1, rows: [[]] });
      expect(absent).toEqual({ rowCount: 1, rows: [null] });
      expect(await select("authors")).toMatchObject([{ favorite_colors: null }]);
    });

    it("decodes custom passwords from scalar subqueries in scalar and POJO RETURNING", async () => {
      // Given a persisted User with a custom PasswordValue distinct from its stored text
      const password = PasswordValue.fromPlainText("secret");
      await insertUser({ name: "User", password: password.encoded });
      const em = newEntityManager();
      const u = table(User);
      const t = table(Tag);
      // And User's CTI family is read-only to mutations, so a scalar source supplies the password
      const passwordQuery = query({ from: u, where: u.id.eq("u:1"), select: u.password });
      // And the actual custom decoder is observed for stored passwords and SQL NULL
      const decode = jest.spyOn(PasswordValueSerde, "fromDb");
      try {
        // When a Tag INSERT returns the scalar password subquery
        const inserted = await em.execute({
          insert: t,
          values: { name: "Credential audit" },
          returning: passwordQuery,
        });
        // Then the subquery retains its custom column decoder instead of returning encoded text
        expect(inserted).toEqual({ rowCount: 1, rows: [password] });
        expect(inserted.rows[0]!.matches("secret")).toBe(true);
        expect(decode).toHaveBeenCalledTimes(1);
        expect(decode).toHaveBeenCalledWith(password.encoded);
        // And the User's password is now SQL NULL rather than encoded text
        await update("users", { id: 1, password: null });
        // When a Tag UPDATE returns that missing password in a named projection
        const cleared = await em.execute({
          update: t,
          set: { name: "Cleared credential" },
          where: t.id.eq("t:1"),
          returning: { password: passwordQuery },
        });
        // Then null bypasses the custom decoder and stays null in the returned POJO
        expect(cleared).toEqual({ rowCount: 1, rows: [{ password: null }] });
        expect(decode).toHaveBeenCalledTimes(1);
        // When deleting the Tag with scalar password RETURNING
        const removed = await em.execute({ delete: t, where: t.id.eq("t:1"), returning: passwordQuery });
        // Then scalar custom decoding also preserves SQL NULL
        expect(removed).toEqual({ rowCount: 1, rows: [null] });
        expect(decode).toHaveBeenCalledTimes(1);
      } finally {
        decode.mockRestore();
      }
    });

    it("propagates a real Zod RETURNING failure after an autocommitted write", async () => {
      // Given an Author whose persisted address initially satisfies AddressSchema
      await insertAuthor({ first_name: "Valid", business_address: { street: "Main" } });
      const em = newEntityManager();
      const a = table(Author);
      resetQueryCount();
      // When SQL writes a numeric street that is valid JSON but invalid for AddressSchema
      const result = em.execute({
        update: a,
        set: { business_address: sql<{ street: string }>`'{"street":123}'::jsonb` },
        where: a.id.eq("a:1"),
        returning: a.business_address,
      });
      // Then the decoder rejects after PostgreSQL has committed, without a hidden transaction
      await expect(result).rejects.toThrow(ZodError);
      expect(queries).toMatchInlineSnapshot(`
        [
          "UPDATE authors AS a SET business_address = '{\"street\":123}'::jsonb WHERE (a.id = $1) AND (a.deleted_at IS NULL) RETURNING a.business_address AS value",
        ]
      `);
      expect(await select("authors")).toMatchObject([{ business_address: { street: 123 } }]);
    });
  });

  describe("read execution", () => {
    it("returns selected-row counts for paginated scalar and named read POJOs", async () => {
      // Given three Authors whose order makes the read page deterministic
      await insertAuthor({ first_name: "Alpha", age: 10 });
      // And Beta has a nullable age that the scalar decoder must preserve
      await insertAuthor({ first_name: "Beta" });
      // And Gamma lies outside the requested page
      await insertAuthor({ first_name: "Gamma", age: 30 });
      const em = newEntityManager();
      const a = table(Author);
      // When execute receives an ordinary scalar-select POJO with pagination
      const scalar = await em.execute({
        from: a,
        select: a.age,
        orderBy: [{ asc: a.first_name }],
        offset: 1,
        limit: 1,
      });
      // And a reusable named read returns the same page with its Author id codec
      const named = await em.execute(
        query({ from: a, select: { id: a.id, age: a.age }, orderBy: [{ asc: a.first_name }], offset: 1, limit: 1 }),
      );
      // Then counts describe the selected page, not all source rows
      expect(scalar).toEqual({ rowCount: 1, rows: [null] });
      expect(named).toEqual({ rowCount: 1, rows: [{ id: "a:2", age: null }] });
      expect(em.entities).toEqual([]);
    });

    it("preserves compound duplicates and reports the paginated selected count", async () => {
      // Given two Tags that appear in both UNION ALL branches
      await insertTag({ name: "Alpha" });
      // And Beta sorts after the repeated Alpha rows
      await insertTag({ name: "Beta" });
      const em = newEntityManager();
      const t = table(Tag);
      resetQueryCount();
      // When execute consumes a compound POJO with ordering and pagination
      const result = await em.execute({
        unionAll: [
          { from: t, select: { name: t.name } },
          { from: t, select: { name: t.name } },
        ],
        orderBy: [{ name: "ASC" }],
        offset: 1,
        limit: 2,
      });
      // Then the command reports the two selected rows instead of the four unpaginated rows
      expect(result).toEqual({ rowCount: 2, rows: [{ name: "Alpha" }, { name: "Beta" }] });
      expect(queries).toMatchInlineSnapshot(`
        [
          "(SELECT t.name AS name FROM tags AS t) UNION ALL (SELECT t1.name AS name FROM tags AS t1) ORDER BY name ASC LIMIT $1 OFFSET $2",
        ]
      `);
    });

    it("returns zero selected rows and rejects executable scalar query values", async () => {
      // Given an empty Tag table and a scalar query expression intended only for SQL contexts
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const t = table(Tag);
      // When an ordinary read selects the empty table
      const empty = await em.execute({ from: t, select: t.id });
      // Then execute returns the driver's zero count in the same stable envelope
      expect(empty).toEqual({ rowCount: 0, rows: [] });
      // And query() changes scalar execution into an expression, not a public executable input
      const scalar = query({ from: t, select: t.id });
      resetQueryCount();
      // When that expression is passed directly to execute at runtime
      await expect(execute(scalar)).rejects.toThrow("Scalar query values are expressions, not executable read inputs");
      // Then no second read is issued for the excluded input
      expect(queries).toEqual([]);
    });
  });

  describe("runtime rejection", () => {
    it.each(["update", "delete"] as const)(
      "rejects absent and fully pruned %s guards before soft-delete injection",
      async (operation) => {
        // Given a soft-deletable Author target whose metadata filter is not user consent
        const em = newEntityManager();
        const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
        const a = table(Author);
        const statement = operation === "update" ? { update: a, set: { age: 50 } } : { delete: a };
        // And each user condition is absent or contains only omitted Author filters
        const guards = [
          {},
          { where: undefined },
          { where: a.first_name.eq(undefined) },
          { where: { and: [a.first_name.eq(undefined), { or: [a.age.eq(undefined)] }] } },
        ];
        // When executing without allowAll, even though a deleted_at predicate could be injected
        for (const guard of guards) {
          await expect(execute({ ...statement, ...guard })).rejects.toThrow(
            "UPDATE and DELETE require a nonempty user where or allowAll: true",
          );
        }
        // Then no unguarded statement reaches PostgreSQL
        expect(queries).toEqual([]);
      },
    );

    it.each([{}, { name: undefined }])("rejects empty INSERT rows and empty UPDATE sets: %j", async (fields) => {
      // Given a Tag assignment object with no defined field values
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const t = table(Tag);
      // When an empty object is used as a row rather than the documented empty-array shortcut
      await expect(execute({ insert: t, values: fields })).rejects.toThrow(
        "insert requires at least one defined field",
      );
      // And an empty row inside a nonempty bulk array must not become DEFAULT VALUES
      await expect(execute({ insert: t, values: [{ name: "Valid" }, fields] })).rejects.toThrow(
        "insert requires at least one defined field",
      );
      // And allowAll must not permit an UPDATE with no assignments after pruning
      await expect(execute({ update: t, set: fields, allowAll: true })).rejects.toThrow(
        "update requires at least one defined field",
      );
      // Then all empty assignment forms fail without SQL
      expect(queries).toEqual([]);
    });

    it.each([
      [{ title: "Missing author", notes: "Explicit" }, "Book.author_id"],
      [{ title: "Missing notes", author_id: "a:1" }, "Book.notes"],
      [{ author_id: "a:1", notes: "Explicit" }, "Book.title"],
      [{ title: "Undefined notes", author_id: "a:1", notes: undefined }, "Book.notes"],
    ])("requires physical Book inputs rather than config defaults: %j", async (values, field) => {
      // Given a Book import that omits a physically required field despite ORM optionality
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const b = table(Book);
      // When executing the incomplete import
      await expect(execute({ insert: b, values })).rejects.toThrow(`INSERT requires ${field}`);
      // Then execute does not run configuration defaults or send invalid SQL
      expect(queries).toEqual([]);
    });

    it("requires each bulk Author row to supply its physically required derived count", async () => {
      // Given one valid Author import followed by one missing its derived NOT NULL count
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const a = table(Author);
      // When an incomplete row follows a complete one in the bulk input
      await expect(
        execute({ insert: a, values: [{ first_name: "Valid", number_of_books: 0 }, { first_name: "Missing count" }] }),
      ).rejects.toThrow("INSERT requires Author.number_of_books");
      // Then validation covers every row before any INSERT executes
      expect(queries).toEqual([]);
    });

    it.each([false, true])("rejects new reference entities with preassigned id=%s", async (preassigned) => {
      // Given a new Author that has not been flushed, regardless of whether its id was preassigned
      const em = newEntityManager();
      const author = em.create(Author, preassigned ? { id: "a:10", firstName: "Pending" } : { firstName: "Pending" });
      const b = table(Book);
      // When a SQL INSERT tries to reference the unpersisted Author
      await expect(
        em.execute({ insert: b, values: { title: "Premature", author_id: author, notes: "Imported" } }),
      ).rejects.toThrow("Cannot reference an unflushed Author, even with an assigned ID");
      // And UPDATE must reject the same unflushed reference before issuing SQL
      await expect(em.execute({ update: b, set: { author_id: author }, allowAll: true })).rejects.toThrow(
        "Cannot reference an unflushed Author, even with an assigned ID",
      );
      // Then execute neither flushes the Author nor performs foreign-key fixups
      expect(queries).toEqual([]);
      expect(author.isNewEntity).toBe(true);
    });

    it.each(["author", "missing", "tags", "reviews", "image", "sequel", "fullName", "__proto__", "constructor"])(
      "rejects unsupported Book assignment key %s even when undefined",
      async (field) => {
        // Given a field name that is not an ordinary writable Book storage field
        const em = newEntityManager();
        const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
        const b = table(Book);
        // When the unknown, collection, inverse, or non-domain key is supplied with undefined
        await expect(
          execute({ insert: b, values: { title: "Import", author_id: "a:1", notes: "Explicit", [field]: undefined } }),
        ).rejects.toThrow(`Unsupported SQL mutation field Book.${field}`);
        // And UPDATE must validate keys before pruning their undefined values
        await expect(
          execute({ update: b, set: { title: "Changed", [field]: undefined }, allowAll: true }),
        ).rejects.toThrow(`Unsupported SQL mutation field Book.${field}`);
        // Then unsupported fields cannot silently disappear during normalization
        expect(queries).toEqual([]);
      },
    );

    it("rejects polymorphic assignments and ignored generated columns", async () => {
      // Given real polymorphic Comment storage and an Author generated tsvector omitted from its domain fields
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const c = table(Comment);
      const a = table(Author);
      // When trying to assign the polymorphic relationship instead of one supported physical reference
      await expect(execute({ update: c, set: { parent: "a:1" }, allowAll: true })).rejects.toThrow(
        "Unsupported SQL mutation field Comment.parent",
      );
      // And the generated SQL-only search vector must not become writable through a guessed domain name
      await expect(execute({ update: a, set: { tsSearch: "text" }, allowAll: true })).rejects.toThrow(
        "Unsupported SQL mutation field Author.tsSearch",
      );
      // Then neither excluded storage form reaches PostgreSQL
      expect(queries).toEqual([]);
    });

    it("rejects nested reference creation, wrong entity types, and primary-key UPDATEs", async () => {
      // Given a Book target and an unrelated new Tag entity
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const b = table(Book);
      const tag = em.create(Tag, { name: "Not an Author" });
      // When nested creation options are assigned to the owning Author reference
      await expect(execute({ update: b, set: { author_id: { firstName: "Nested" } }, allowAll: true })).rejects.toThrow(
        "nested creation is not supported",
      );
      // And an entity of another type cannot use the Author foreign-key codec
      await expect(execute({ update: b, set: { author_id: tag }, allowAll: true })).rejects.toThrow(
        "Expected a Author reference",
      );
      // And even an unchanged primary key is not an allowed UPDATE assignment
      await expect(execute({ update: b, set: { id: "b:1" }, where: b.id.eq("b:1") })).rejects.toThrow(
        "UPDATE primary-key assignments are not supported",
      );
      // Then all reference and identity errors are detected before SQL
      expect(queries).toEqual([]);
    });

    it.each([Publisher, SmallPublisher, LargePublisher, Task, TaskNew, TaskOld, User, AdminUser])(
      "rejects inherited mutation target %p even for empty VALUES",
      async (type) => {
        // Given a CTI or STI family whose reads do not imply single-table mutation support
        const em = newEntityManager();
        const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
        const target = table<Entity>(type);
        // When an empty INSERT attempts to bypass the target-family restriction
        await expect(execute({ insert: target, values: [] })).rejects.toThrow(
          "SQL mutations do not support CTI/STI targets or inherited table families",
        );
        // And DELETE cannot treat an inherited root or subtype as an ordinary target
        await expect(execute({ delete: target, allowAll: true })).rejects.toThrow(
          "SQL mutations do not support CTI/STI targets or inherited table families",
        );
        // Then no inherited mutation is issued
        expect(queries).toEqual([]);
      },
    );

    it.each(["insert", "update"] as const)(
      "enforces physical NOT NULL on %s before running codecs",
      async (operation) => {
        // Given Author.initials is derived in the ORM but physically NOT NULL in PostgreSQL
        const em = newEntityManager();
        const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
        const a = table(Author);
        const statement =
          operation === "insert"
            ? { insert: a, values: { first_name: "Null initials", number_of_books: 0, initials: null } }
            : { update: a, set: { initials: null }, allowAll: true };
        // When explicitly assigning SQL NULL rather than omission or DEFAULT
        await expect(execute(statement)).rejects.toThrow("Author.initials is physically NOT NULL");
        // Then ORM-derived optionality does not override the database's nullability
        expect(queries).toEqual([]);
      },
    );

    it("rejects direct target-column expressions in INSERT VALUES", async () => {
      // Given a target alias with no existing row available during VALUES evaluation
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const t = table(Tag);
      // When a direct column or SQL expression tries to read the row being inserted
      await expect(execute({ insert: t, values: { name: t.name } })).rejects.toThrow(
        "is not in this query's from/join",
      );
      // And wrapping the same target reference in a SQL fragment cannot add a source scope
      await expect(execute({ insert: t, values: { name: sql<string>`upper(${t.name})` } })).rejects.toThrow(
        "is not in this query's from/join",
      );
      // Then both invalid references fail before SQL
      expect(queries).toEqual([]);
    });

    it("keeps INSERT source aliases out of target RETURNING and unrelated aliases out of UPDATE", async () => {
      // Given distinct source and target Tag aliases
      const em = newEntityManager();
      const source = table(Tag);
      const target = table(Tag);
      // When RETURNING tries to read the INSERT SELECT source rather than the new target
      await expect(
        em.execute({ insert: target, from: { from: source, select: { name: source.name } }, returning: source.name }),
      ).rejects.toThrow("is not in this query's from/join");
      // And an unrelated source alias cannot become an implicit UPDATE join
      await expect(em.execute({ update: target, set: { name: source.name }, allowAll: true })).rejects.toThrow(
        "is not in this query's from/join",
      );
      // Then mutation scopes reject both unregistered aliases
      expect(queries).toEqual([]);
    });

    it("rejects mixed roots, missing input, and values/from mixtures", async () => {
      // Given a valid Tag alias and named read to isolate malformed mutation roots
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const t = table(Tag);
      const from = { from: t, select: { name: t.name } };
      // When more than one root operation is present, including an undefined extra root
      await expect(execute({ insert: t, delete: undefined, values: [] })).rejects.toThrow(
        "exactly one insert, update, or delete root",
      );
      // And values and from cannot coexist even for an empty VALUES shortcut
      await expect(execute({ insert: t, values: [], from })).rejects.toThrow(
        "INSERT requires exactly one of values or from",
      );
      // And a missing INSERT source must not infer DEFAULT VALUES
      await expect(execute({ insert: t })).rejects.toThrow("INSERT requires exactly one of values or from");
      // And an unknown root must not be interpreted as a supported mutation
      await expect(execute({ upsert: t, values: [] })).rejects.toThrow();
      // Then malformed roots never issue SQL
      expect(queries).toEqual([]);
    });

    it.each(["with", "onConflict", "select", "join", "orderBy", "limit", "unionAll"])(
      "rejects excluded INSERT clause %s before an empty VALUES shortcut",
      async (clause) => {
        // Given an empty Tag import with an unsupported clause explicitly present
        const em = newEntityManager();
        const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
        const t = table(Tag);
        // When the excluded clause is supplied even with an undefined value
        await expect(execute({ insert: t, values: [], [clause]: undefined })).rejects.toThrow(
          `SQL insert does not support '${clause}'`,
        );
        // Then empty input does not bypass statement validation
        expect(queries).toEqual([]);
      },
    );

    it("rejects UPDATE FROM, DELETE USING, and malformed policy values", async () => {
      // Given a Tag target with valid assignments but unsupported mutation extensions
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const t = table(Tag);
      // When an UPDATE attempts to declare a FROM source
      await expect(execute({ update: t, set: { name: "Changed" }, from: t, allowAll: true })).rejects.toThrow(
        "SQL update does not support 'from'",
      );
      // And DELETE USING remains outside this mutation API
      await expect(execute({ delete: t, using: t, allowAll: true })).rejects.toThrow(
        "SQL delete does not support 'using'",
      );
      // And truthy strings are not consent to update every row
      await expect(execute({ update: t, set: { name: "Changed" }, allowAll: "true" })).rejects.toThrow(
        "allowAll must be a boolean",
      );
      // And an unknown soft-delete mode cannot silently change the target row set
      await expect(execute({ delete: t, allowAll: true, softDeletes: "only" })).rejects.toThrow(
        "softDeletes must be 'include' or 'exclude'",
      );
      // Then all unsupported clauses and policies fail before SQL
      expect(queries).toEqual([]);
    });

    it("rejects malformed assignment containers and non-alias targets", async () => {
      // Given a Tag constructor, a read value, and invalid assignment containers
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const t = table(Tag);
      // When a constructor is passed where a target alias is required
      await expect(execute({ insert: Tag, values: [] })).rejects.toThrow("A mutation target must be an entity table");
      // And a reusable named read is not a mutable table target
      await expect(execute({ delete: query({ from: t, select: { name: t.name } }), allowAll: true })).rejects.toThrow(
        "A mutation target must be an entity table",
      );
      // And primitive VALUES are not domain-field assignments
      await expect(execute({ insert: t, values: "name" })).rejects.toThrow("insert assignments must be a field POJO");
      // And an array of UPDATE sets does not mean a bulk UPDATE
      await expect(execute({ update: t, set: [{ name: "Changed" }], allowAll: true })).rejects.toThrow(
        "update assignments must be a field POJO",
      );
      // Then none of these excluded shapes reaches PostgreSQL
      expect(queries).toEqual([]);
    });

    it("rejects entity-shaped and malformed RETURNING before empty-input optimization", async () => {
      // Given a Tag alias and source-shaped values that are not expression projections
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const t = table(Tag);
      // And malformed projections include empty objects, nested objects, raw values, and read values
      const projections = [
        t,
        query({ from: t, select: t }),
        query({ from: t, select: { name: t.name } }),
        {},
        [],
        null,
        "name",
        { name: "literal" },
        { nested: { name: t.name } },
      ];
      // When each invalid projection is attached to an otherwise valid empty INSERT
      for (const returning of projections) {
        await expect(execute({ insert: t, values: [], returning })).rejects.toThrow();
      }
      // Then RETURNING can neither hydrate entities nor bypass projection validation
      expect(queries).toEqual([]);
    });

    it("rejects mutations as read POJOs, query values, and compound operands", async () => {
      // Given a valid Tag mutation that belongs only at the execute entry point
      const em = newEntityManager();
      const read = em.query.bind(em) as (statement: unknown) => Promise<unknown[]>;
      const readValue = query as (statement: unknown) => unknown;
      const t = table(Tag);
      const mutation = { insert: t, values: { name: "Imported" }, returning: { name: t.name } };
      // When a mutation is passed to the ordinary read executor
      await expect(read(mutation)).rejects.toThrow(
        "Read queries do not support mutation clause 'insert'; use em.execute",
      );
      // And reusable query values must not wrap a mutation
      expect(() => readValue(mutation)).toThrow("Read queries do not support mutation clause 'insert'; use em.execute");
      // And a compound read cannot execute a mutation operand
      await expect(read({ unionAll: [{ from: t, select: { name: t.name } }, mutation] })).rejects.toThrow(
        "Read queries do not support mutation clause 'insert'; use em.execute",
      );
      // Then no excluded read form executes the INSERT
      expect(queries).toEqual([]);
    });

    it("rejects unnamed, missing, extra, nullable, and codec-incompatible INSERT sources", async () => {
      // Given Book source and target aliases plus a User with an incompatible custom password codec
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const source = table(Book);
      const target = table(Book);
      const u = table(User);
      // When a scalar read omits target-field names
      await expect(execute({ insert: target, from: { from: source, select: source.title } })).rejects.toThrow(
        "INSERT SELECT requires named POJO output columns",
      );
      // And entity-shaped reads are not assignment projections
      await expect(execute({ insert: target, from: query({ from: source, select: source }) })).rejects.toThrow(
        "INSERT SELECT requires named POJO output columns",
      );
      // And a reusable scalar expression is not an executable source read
      await expect(execute({ insert: target, from: query({ from: source, select: source.title }) })).rejects.toThrow(
        "Scalar query values are expressions, not executable read inputs",
      );
      // And named sources must include required notes even though the ORM config has a default
      await expect(
        execute({
          insert: target,
          from: { from: source, select: { title: source.title, author_id: source.author_id } },
        }),
      ).rejects.toThrow("INSERT requires Book.notes");
      // And extra keys cannot be silently dropped when matching output columns
      await expect(
        execute({
          insert: target,
          from: {
            from: source,
            select: { title: source.title, author_id: source.author_id, notes: source.notes, extra: source.title },
          },
        }),
      ).rejects.toThrow("Unsupported SQL mutation field Book.extra");
      // And Book ids cannot be substituted for Author foreign keys despite identical SQL integer storage
      await expect(
        execute({
          insert: target,
          from: { from: source, select: { title: source.title, author_id: source.id, notes: source.notes } },
        }),
      ).rejects.toThrow("INSERT SELECT Book.author_id has incompatible or unknown storage codecs");
      // And nullable reviewer ids cannot satisfy the physically required author column
      await expect(
        execute({
          insert: target,
          from: { from: source, select: { title: source.title, author_id: source.reviewer_id, notes: source.notes } },
        }),
      ).rejects.toThrow("INSERT SELECT Book.author_id cannot accept a nullable output");
      // And unannotated SQL storage cannot be assumed compatible solely from a TypeScript generic
      await expect(
        execute({
          insert: target,
          from: {
            from: source,
            select: { title: sql<string>`'Title'`, author_id: source.author_id, notes: source.notes },
          },
        }),
      ).rejects.toThrow("INSERT SELECT Book.title has incompatible or unknown storage codecs");
      // And custom password storage is not interchangeable with ordinary varchar name storage
      await expect(execute({ insert: table(Tag), from: { from: u, select: { name: u.password } } })).rejects.toThrow(
        "INSERT SELECT Tag.name has incompatible or unknown storage codecs",
      );
      // Then every incompatible source is rejected without fetching or writing rows
      expect(queries).toEqual([]);
    });
  });

  describe("reviewed regressions", () => {
    it.each(["update", "delete"] as const)("rejects malformed %s groups even with allowAll", async (operation) => {
      // Given a Tag mutation with explicit full-table consent that must not excuse malformed predicates
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const t = table(Tag);
      const statement =
        operation === "update"
          ? { update: t, set: { name: "Changed" }, allowAll: true }
          : { delete: t, allowAll: true };
      // And the intended name restriction is a valid condition inside the malformed groups
      const selected = t.name.eq("Selected");
      // When a predicate contains both AND and OR, neither group may silently take precedence
      await expect(execute({ ...statement, where: { and: [selected], or: [selected] } })).rejects.toThrow(
        "Query conditions require exactly one and/or group",
      );
      // And an undefined second group is still an explicitly supplied conflicting key
      await expect(execute({ ...statement, where: { and: [selected], or: undefined } })).rejects.toThrow(
        "Query conditions require exactly one and/or group",
      );
      // And ambiguous groups nested inside a valid outer AND must also be rejected
      await expect(execute({ ...statement, where: { and: [{ and: [selected], or: [] }] } })).rejects.toThrow(
        "Query conditions require exactly one and/or group",
      );
      // And misspelled group keys must not discard part of the Tag restriction
      await expect(execute({ ...statement, where: { and: [selected], otherwise: [] } })).rejects.toThrow(
        "Query condition group does not support 'otherwise'",
      );
      // And an unknown key remains invalid inside a nested OR
      await expect(execute({ ...statement, where: { and: [{ or: [selected], extra: undefined }] } })).rejects.toThrow(
        "Query condition group does not support 'extra'",
      );
      // And a single condition cannot stand in for the group's required array
      await expect(execute({ ...statement, where: { and: selected } })).rejects.toThrow(
        "Query condition groups require an array",
      );
      // And an unrecognized pruning policy cannot erase the name restriction
      await expect(execute({ ...statement, where: { and: [selected], pruneIfUndefined: "always" } })).rejects.toThrow(
        "Invalid query pruneIfUndefined policy",
      );
      // And an invalid nested pruning policy is rejected even if its only filter would prune away
      await expect(
        execute({ ...statement, where: { and: [{ or: [undefined], pruneIfUndefined: true }] } }),
      ).rejects.toThrow("Invalid query pruneIfUndefined policy");
      // Then allowAll does not let any malformed predicate reach PostgreSQL
      expect(queries).toEqual([]);
    });

    it.each(["update", "delete"] as const)(
      "rejects malformed %s leaves before pruning even with allowAll",
      async (operation) => {
        // Given a Tag mutation that otherwise permits all rows
        const em = newEntityManager();
        const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
        const t = table(Tag);
        const statement =
          operation === "update"
            ? { update: t, set: { name: "Changed" }, allowAll: true }
            : { delete: t, allowAll: true };
        // And a real column condition supplies the column and storage facts for invalid leaf variants
        const selected = t.name.like("Selected%") as ColumnCondition;
        // When a null leaf appears beside an omitted condition, pruning must not turn it into full-table consent
        await expect(execute({ ...statement, where: { and: [undefined, null] } })).rejects.toThrow(
          "Query predicate must be a condition or an and/or group",
        );
        // And a nested array is not another condition group
        await expect(execute({ ...statement, where: { and: [[selected]] } })).rejects.toThrow(
          "Query predicate must be a condition or an and/or group",
        );
        // And primitive predicates are not raw SQL expressions
        await expect(execute({ ...statement, where: true })).rejects.toThrow(
          "Query predicate must be a condition or an and/or group",
        );
        // And an unrecognized leaf kind cannot silently disappear
        await expect(execute({ ...statement, where: { kind: "missing" } })).rejects.toThrow("Unknown query condition");
        // And column leaves require a string database type, not an arbitrary truthy value
        await expect(execute({ ...statement, where: { ...selected, dbType: 1 } })).rejects.toThrow(
          "Malformed query column condition",
        );
        // And column leaves require an actual filter object
        await expect(execute({ ...statement, where: { ...selected, cond: undefined } })).rejects.toThrow(
          "Malformed query column filter",
        );
        // And unknown filter operations must not reach the SQL builder
        await expect(
          execute({ ...statement, where: { ...selected, cond: { kind: "equals", value: "Selected" } } }),
        ).rejects.toThrow("Malformed query column filter");
        // And binary filters must explicitly supply their value key
        await expect(execute({ ...statement, where: { ...selected, cond: { kind: "eq" } } })).rejects.toThrow(
          "Malformed query column filter",
        );
        // And unary filters cannot carry a value that the SQL builder would ignore
        await expect(
          execute({ ...statement, where: { ...selected, cond: { kind: "is-null", value: "Selected" } } }),
        ).rejects.toThrow("Unary query filters do not accept values");
        // And unknown filter keys cannot be discarded during normalization
        await expect(
          execute({ ...statement, where: { ...selected, cond: { kind: "eq", value: "Selected", extra: true } } }),
        ).rejects.toThrow("Query column filter does not support 'extra'");
        // And a raw condition with non-array bindings is malformed even if its SQL text is valid
        await expect(
          execute({
            ...statement,
            where: { kind: "raw", aliases: [], condition: "true", bindings: {}, pruneable: false },
          }),
        ).rejects.toThrow("Malformed query raw condition");
        // And raw aliases must name SQL sources rather than contain arbitrary values
        await expect(
          execute({
            ...statement,
            where: { kind: "raw", aliases: [1], condition: "true", bindings: [], pruneable: false },
          }),
        ).rejects.toThrow("Malformed query raw condition");
        // Then all invalid leaves fail before any Tag can be changed or deleted
        expect(queries).toEqual([]);
      },
    );

    it("rejects a malformed nested scalar DELETE restriction before outer guard pruning", async () => {
      // Given a reusable scalar Tag-id read that starts with a valid name restriction
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const source = table(Tag);
      const target = table(Tag);
      const read = { from: source, select: source.id, where: { and: [source.name.eq("Selected")] } };
      const ids = query(read);
      // And the stored read is corrupted after construction with conflicting nested AND and OR groups
      Object.assign(read, { where: { and: [{ or: [source.name.eq("Selected")], and: [] }] } });
      // When DELETE consumes those ids inside an outer group that could otherwise prune to allowAll
      await expect(
        execute({
          delete: target,
          where: { and: [target.id.in(ids), undefined], pruneIfUndefined: "any" },
          allowAll: true,
        }),
      ).rejects.toThrow("Query conditions require exactly one and/or group");
      // Then nested source validation prevents an accidental unrestricted DELETE before any SQL
      expect(queries).toEqual([]);
    });

    it.each([false, true])("rejects a malformed INSERT SELECT branch with reusable source=%s", async (reusable) => {
      // Given two valid named Tag reads whose UNION ALL output can populate Tag.name
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const source = table(Tag);
      const target = table(Tag);
      const first = { from: source, select: { name: source.name } };
      const second = { from: source, select: { name: source.name }, where: { and: [source.name.eq("Selected")] } };
      const compound = { unionAll: [first, second] };
      const statement = { insert: target, from: reusable ? query(compound) : compound };
      // And only the non-first branch is corrupted with an unknown nested condition-group key
      Object.assign(second, { where: { and: [{ or: [source.name.eq("Selected")], otherwise: [] }] } });
      // When INSERT SELECT compiles the stored compound rather than merely trusting its named output
      await expect(execute(statement)).rejects.toThrow("Query condition group does not support 'otherwise'");
      // Then no source SELECT or destination INSERT is issued for either source representation
      expect(queries).toEqual([]);
    });

    it.each(["limit", "offset"] as const)("rejects invalid source %s before INSERT or DELETE SQL", async (key) => {
      // Given a named Tag source and a reusable scalar Tag-id source for mutation predicates
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const source = table(Tag);
      const target = table(Tag);
      const named = { from: source, select: { name: source.name } };
      const scalar = { from: source, select: source.id };
      const ids = query(scalar);
      // And null, negative, fractional, nonfinite, and wrong-type page sizes cannot mean omitted pagination
      const invalid = [null, -1, 0.5, Infinity, -Infinity, NaN, "1", true];
      // When each invalid value is supplied to mutation source reads
      for (const value of invalid) {
        await expect(execute({ insert: target, from: { ...named, [key]: value } })).rejects.toThrow(
          `Read query ${key} must be a nonnegative finite integer`,
        );
        // And pagination on the compound root must not pass invalid values through to PostgreSQL
        await expect(execute({ insert: target, from: { unionAll: [named, named], [key]: value } })).rejects.toThrow(
          `Read query ${key} must be a nonnegative finite integer`,
        );
        // And invalid pagination in a non-first branch must not be hidden by valid compound output metadata
        await expect(
          execute({ insert: target, from: { unionAll: [named, { ...named, [key]: value }] } }),
        ).rejects.toThrow(`Read query ${key} must be a nonnegative finite integer`);
        // And the reusable scalar read gains the invalid option only after its expression was constructed
        Object.assign(scalar, { [key]: value });
        // When DELETE evaluates that scalar read inside its IN predicate
        await expect(execute({ delete: target, where: target.id.in(ids), allowAll: true })).rejects.toThrow(
          `Read query ${key} must be a nonnegative finite integer`,
        );
      }
      // Then every source shape fails validation before selecting or mutating Tags
      expect(queries).toEqual([]);
    });

    it.each([null, "only", false, 0])("rejects invalid source softDeletes=%p before mutation SQL", async (policy) => {
      // Given valid named and scalar Author reads with a real soft-delete metadata policy
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const source = table(Author);
      const target = table(Author);
      const named = {
        from: source,
        select: { first_name: source.first_name, number_of_books: source.number_of_books },
      };
      const scalar = { from: source, select: source.id };
      const reusable = query(named);
      const ids = query(scalar);
      // And both stored reads gain an invalid policy after their reusable values were created
      Object.assign(named, { softDeletes: policy });
      Object.assign(scalar, { softDeletes: policy });
      // When a plain INSERT SELECT source tries to apply the invalid policy
      await expect(execute({ insert: target, from: named })).rejects.toThrow(
        "Read query softDeletes must be 'include' or 'exclude'",
      );
      // And reusable source values must revalidate the same stored policy at execution
      await expect(execute({ insert: target, from: reusable })).rejects.toThrow(
        "Read query softDeletes must be 'include' or 'exclude'",
      );
      // And a valid outer DELETE policy must not excuse the invalid scalar source's policy
      await expect(
        execute({ delete: target, where: target.id.in(ids), softDeletes: "include", allowAll: true }),
      ).rejects.toThrow("Read query softDeletes must be 'include' or 'exclude'");
      // Then invalid policy values cannot silently default to excluding or including deleted Authors
      expect(queries).toEqual([]);
    });

    it("rejects inherited full-table consent and inherited operation roots", async () => {
      // Given a Tag target with no own user predicate or own full-table consent
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const t = table(Tag);
      // And a custom prototype tries to provide allowAll instead of an own statement clause
      const inheritedConsent = Object.assign(Object.create({ allowAll: true }), {
        update: t,
        set: { name: "Changed" },
      });
      // When executing the inherited consent statement
      await expect(execute(inheritedConsent)).rejects.toThrow("SQL update must be a plain POJO");
      // And another statement inherits the DELETE operation instead of declaring its own root
      const inheritedRoot = Object.assign(Object.create({ delete: t }), { allowAll: true });
      // When executing the inherited root statement
      await expect(execute(inheritedRoot)).rejects.toThrow("SQL delete must be a plain POJO");
      // And an empty INSERT with an otherwise empty custom prototype is not a plain statement either
      const customPrototype = Object.assign(Object.create({}), { insert: t, values: [] });
      // When the empty-input shortcut could otherwise hide the unsupported prototype
      await expect(execute(customPrototype)).rejects.toThrow("SQL insert must be a plain POJO");
      // Then neither inherited clauses nor root prototypes can authorize writes
      expect(queries).toEqual([]);
    });

    it("rejects hidden and symbol statement keys before empty-input optimization", async () => {
      // Given a Tag target and an empty INSERT that still requires full statement validation
      const em = newEntityManager();
      const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
      const t = table(Tag);
      // And the INSERT operation is deliberately non-enumerable instead of an ordinary root key
      const hiddenRoot = Object.defineProperty({ values: [] }, "insert", { value: t });
      // When an invisible root attempts to use the empty-array shortcut
      await expect(execute(hiddenRoot)).rejects.toThrow("SQL insert requires enumerable fields");
      // And hidden full-table consent is not an own enumerable mutation clause
      const hiddenConsent = Object.defineProperty({ delete: t }, "allowAll", { value: true });
      // When a DELETE relies on that hidden consent
      await expect(execute(hiddenConsent)).rejects.toThrow("SQL delete requires enumerable fields");
      // And unknown clauses must be checked even when non-enumerable
      const hiddenClause = Object.defineProperty({ insert: t, values: [] }, "onConflict", { value: undefined });
      // When a hidden unsupported clause is attached to an empty import
      await expect(execute(hiddenClause)).rejects.toThrow("SQL insert does not support 'onConflict'");
      // And symbol keys are not valid statement extensions
      const symbolic = { insert: t, values: [], [Symbol("extension")]: undefined };
      // When a symbol property would be skipped by Object.keys
      await expect(execute(symbolic)).rejects.toThrow("SQL insert does not support 'Symbol(extension)'");
      // Then all non-POJO root shapes are rejected without SQL
      expect(queries).toEqual([]);
    });

    it.each([false, true])(
      "executes virtual mutation-named read columns in read-only mode with compound=%s",
      async (compound) => {
        // Given a persisted Tag that can be returned as plain read data
        await insertTag({ name: "Readable" });
        const em = newEntityManager();
        const t = table(Tag);
        // And the reusable read exposes mutation names as virtual output columns, not root clauses
        const source = { from: t, select: { insert: t.name, update: t.id, delete: t.name } };
        const statement = compound ? query({ unionAll: [source, source] }) : query(source);
        // And write permissions are disabled so misclassification would fail before the read
        em.mode = "read-only";
        // When execute receives the branded read value directly
        const result = await em.execute(statement);
        // Then each mutation-named column remains read data with the correct id decoder
        expect(result.rowCount).toBe(compound ? 2 : 1);
        expect(result.rows).toEqual(
          compound
            ? [
                { insert: "Readable", update: "t:1", delete: "Readable" },
                { insert: "Readable", update: "t:1", delete: "Readable" },
              ]
            : [{ insert: "Readable", update: "t:1", delete: "Readable" }],
        );
        expect(em.entities).toEqual([]);
      },
    );

    it.each(["insert", "update", "delete"] as const)(
      "rejects branded EntityQuery values with an attached %s root",
      async (operation) => {
        // Given a genuine branded entity read rather than a forged query handle
        const em = newEntityManager();
        const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
        const read = em.query.bind(em) as (statement: unknown) => Promise<unknown[]>;
        const t = table(Tag);
        // And an attached mutation root must not disappear when the entity read is unwrapped
        const hybrid = Object.assign(query({ from: t, select: t }), { [operation]: t });
        // And read-only mode makes it observable that branded hybrids reach read validation, not write permissions
        em.mode = "read-only";
        // When the ordinary read executor receives the hybrid
        await expect(read(hybrid)).rejects.toThrow(
          `Read queries do not support mutation clause '${operation}'; use em.execute`,
        );
        // And the metadata-bearing executor must reject the same extra root
        await expect(execute(hybrid)).rejects.toThrow(
          `Read queries do not support mutation clause '${operation}'; use em.execute`,
        );
        // Then neither executor issues a read or a write for the malformed branded input
        expect(queries).toEqual([]);
        expect(em.entities).toEqual([]);
      },
    );

    it.each(["inherited", "non-enumerable"] as const)(
      "rejects %s clauses attached to branded EntityQuery values",
      async (placement) => {
        // Given a real entity read whose only valid own key is its read brand
        const em = newEntityManager();
        const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
        const read = em.query.bind(em) as (statement: unknown) => Promise<unknown[]>;
        const t = table(Tag);
        const entityRead = query({ from: t, select: t });
        // And a DELETE clause is deliberately hidden outside ordinary enumerable own keys
        const hybrid =
          placement === "inherited"
            ? Object.assign(Object.create({ delete: t }), entityRead)
            : Object.defineProperty(entityRead, "delete", { value: t });
        // When each executor validates the branded read before unwrapping its underlying query
        await expect(read(hybrid)).rejects.toThrow(
          "Read queries do not support mutation clause 'delete'; use em.execute",
        );
        // And execute must inspect the same inherited or non-enumerable clauses
        await expect(execute(hybrid)).rejects.toThrow(
          "Read queries do not support mutation clause 'delete'; use em.execute",
        );
        // Then hidden hybrid clauses cannot be silently ignored
        expect(queries).toEqual([]);
      },
    );

    it.each(["update", "delete"] as const)(
      "reuses a frozen %s statement without modifying its frozen AND guard",
      async (operation) => {
        // Given a selected Tag and an unrelated Tag that must remain outside the frozen guard
        await insertTag({ name: "Selected original" });
        // And the unrelated Tag makes unintended guard pruning observable
        await insertTag({ name: "Retained" });
        const em = newEntityManager();
        const execute = em.execute.bind(em) as (statement: unknown) => Promise<ExecuteResult<unknown>>;
        const t = table(Tag);
        // And the column leaf, filter, group, and array are all frozen before alias resolution
        const selected = t.name.like("Selected%") as ColumnCondition;
        Object.freeze(selected.cond);
        Object.freeze(selected);
        const where = { and: [selected, undefined] };
        Object.freeze(where.and);
        Object.freeze(where);
        // And compilation must not add normalized clauses to the frozen root or SET object
        const statement = Object.freeze(
          operation === "update"
            ? { update: t, set: Object.freeze({ name: "Selected changed" }), where, returning: t.id }
            : { delete: t, where, returning: t.id },
        );
        // When the immutable statement is executed once
        const first = await execute(statement);
        // And the exact same statement and condition objects are executed again
        const second = await execute(statement);
        // Then UPDATE remains repeatable while DELETE correctly finds no row on its second execution
        expect(first).toEqual({ rowCount: 1, rows: ["t:1"] });
        expect(second).toEqual(operation === "update" ? { rowCount: 1, rows: ["t:1"] } : { rowCount: 0, rows: [] });
        expect(selected.alias).toBe("unset");
        expect(selected.cond).toEqual({ kind: "like", value: "Selected%" });
        expect(where.and).toEqual([selected, undefined]);
        expect(await select("tags")).toMatchObject(
          operation === "update" ? [{ name: "Selected changed" }, { name: "Retained" }] : [{ name: "Retained" }],
        );
      },
    );

    it("reuses a frozen INSERT SELECT source and its frozen deferred guard unchanged", async () => {
      // Given a source Tag whose id will keep both imports restricted to the original row
      await insertTag({ name: "Source" });
      const em = newEntityManager();
      const source = table(Tag);
      const target = table(Tag);
      // And the source's deferred column guard and pruning group are immutable
      const selected = source.name.like("Source") as ColumnCondition;
      Object.freeze(selected.cond);
      Object.freeze(selected);
      const where = { and: [selected, source.id.eq("t:1"), undefined] };
      Object.freeze(where.and[1]);
      Object.freeze(where.and);
      Object.freeze(where);
      // And both the source read POJO and outer INSERT statement are frozen reusable values
      const read = Object.freeze({ from: source, where, select: Object.freeze({ name: source.name }) });
      const statement = Object.freeze({ insert: target, from: query(read), returning: target.id });
      // When INSERT SELECT compiles the immutable source for its first import
      const first = await em.execute(statement);
      // And the same source is reused after a copy exists in the target table
      const second = await em.execute(statement);
      // Then each import copies only the original Tag and leaves deferred source metadata untouched
      expect(first).toEqual({ rowCount: 1, rows: ["t:2"] });
      expect(second).toEqual({ rowCount: 1, rows: ["t:3"] });
      expect(selected.alias).toBe("unset");
      expect(selected.cond).toEqual({ kind: "like", value: "Source" });
      expect(where.and[2]).toBeUndefined();
      expect(read.where).toBe(where);
      expect(await select("tags")).toMatchObject([{ name: "Source" }, { name: "Source" }, { name: "Source" }]);
    });

    it.each(["read", "returning"] as const)(
      "decodes an own __proto__ output safely in %s projections",
      async (projection) => {
        // Given an Author with a JSON address object that must not become a returned row's prototype
        await insertAuthor({ first_name: "Owner", address: { street: "Main" } });
        const em = newEntityManager();
        const a = table(Author);
        // And a computed key declares __proto__ as a real named output property
        const fields = { ["__proto__"]: a.address };
        // When decoding either a read projection or an UPDATE RETURNING projection
        const result =
          projection === "read"
            ? await em.execute({ from: a, select: fields })
            : await em.execute({
                update: a,
                set: { first_name: "Backfilled" },
                where: a.id.eq("a:1"),
                returning: fields,
              });
        // Then the address is own enumerable data and neither the result nor Object.prototype is polluted
        expect(result).toEqual({ rowCount: 1, rows: [{ ["__proto__"]: { street: "Main" } }] });
        expect(Object.getPrototypeOf(result.rows[0])).toBe(Object.prototype);
        expect(Object.getOwnPropertyDescriptor(result.rows[0], "__proto__")).toEqual({
          value: { street: "Main" },
          enumerable: true,
          configurable: true,
          writable: true,
        });
        expect("street" in result.rows[0]).toBe(false);
        expect(Object.hasOwn(Object.prototype, "street")).toBe(false);
        expect(em.entities).toEqual([]);
      },
    );

    it.each(["sqlNullable", "hasDefault", "isGenerated"] as const)(
      "requires physical %s for mutations but not legacy reads",
      async (fact) => {
        // Given a persisted Tag with ordinary read and filter codecs
        await insertTag({ name: "Readable" });
        const em = newEntityManager();
        const t = table(Tag);
        // And its column models legacy metadata missing one physical fact
        const column = getMetadata(Tag).fields.name.serde!.columns[0];
        const original = column[fact];
        delete column[fact];
        resetQueryCount();
        try {
          // Then INSERT and UPDATE fail clearly before issuing SQL
          await expect(em.execute({ insert: t, values: { name: "Forbidden" } })).rejects.toThrow(
            "Missing physical metadata for Tag.name; run codegen",
          );
          await expect(em.execute({ update: t, set: { name: "Forbidden" }, allowAll: true })).rejects.toThrow(
            "Missing physical metadata for Tag.name; run codegen",
          );
          expect(queries).toEqual([]);
          // And both read APIs still use the existing codecs
          expect(await em.query({ from: t, where: t.name.eq("Readable"), select: t.name })).toEqual(["Readable"]);
          expect(await em.execute({ from: t, select: t.name })).toEqual({ rowCount: 1, rows: ["Readable"] });
        } finally {
          column[fact] = original;
        }
      },
    );

    it("rejects unsupported column value writes while preserving legacy column reads", async () => {
      // Given a persisted Tag whose ordinary read and filter codecs remain supported
      await insertTag({ name: "Readable" });
      const em = newEntityManager();
      const t = table(Tag);
      // And the real column temporarily models an older custom Column without the optional write capability
      const column = getMetadata(Tag).fields.name.serde!.columns[0];
      const original = Object.getOwnPropertyDescriptor(column, "mapToDbValue");
      Object.defineProperty(column, "mapToDbValue", { value: undefined, configurable: true, writable: true });
      resetQueryCount();
      try {
        // When INSERT would need the unavailable domain-value write encoder
        await expect(em.execute({ insert: t, values: { name: "Forbidden" } })).rejects.toThrow(
          "The codec for Tag.name does not support SQL value writes",
        );
        // And UPDATE must not fall back to the legacy filter encoder for domain assignments
        await expect(em.execute({ update: t, set: { name: "Forbidden" }, allowAll: true })).rejects.toThrow(
          "The codec for Tag.name does not support SQL value writes",
        );
        // Then both writes fail before SQL and leave the original Tag intact
        expect(queries).toEqual([]);
        // When the rows-only read API uses the legacy filter and decode paths
        const read = await em.query({ from: t, where: t.name.eq("Readable"), select: { name: t.name } });
        // And execute reads require no column value-write encoder either
        const executed = await em.execute({ from: t, where: t.name.eq("Readable"), select: t.name });
        // Then both read contracts remain usable with the older Column shape
        expect(read).toEqual([{ name: "Readable" }]);
        expect(executed).toEqual({ rowCount: 1, rows: ["Readable"] });
        expect(await select("tags")).toMatchObject([{ id: 1, name: "Readable" }]);
      } finally {
        if (original) Object.defineProperty(column, "mapToDbValue", original);
        else delete column.mapToDbValue;
      }
    });
  });
});
