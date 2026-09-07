import { Deferred, ReadOnlyError, query, table } from "joist-orm";
import { PostgresDriver } from "joist-orm/pg";
import { Author, AuthorSchedule, Book, Tag, newAuthorSchedule } from "src/entities";
import { insertAuthor, insertBook, insertTag, select } from "src/entities/inserts";
import { newEntityManager, pool, queries, recordQuery, resetQueryCount } from "src/testEm";
import { ZodError } from "zod";

describe("EntityManager.execute.execution", () => {
  describe("permissions", () => {
    it.each(["read-only", "in-memory-writes"] as const)(
      "rejects every mutation in %s mode before SQL",
      async (mode) => {
        // Given a fresh EntityManager and a Tag mutation target
        const em = newEntityManager();
        const t = table(Tag);
        // And the selected mode does not permit immediate SQL writes
        em.mode = mode;
        // And each statement is otherwise valid, including the empty import shortcut
        const statements = [
          { insert: t, values: { name: "Forbidden" } },
          { update: t, set: { name: "Forbidden" }, where: t.id.eq("t:1") },
          { delete: t, where: t.id.eq("t:1") },
          { insert: t, values: [] },
        ] as const;

        // When executing each write through the same entry point
        for (const statement of statements) {
          await expect(em.execute(statement)).rejects.toThrow(
            mode === "read-only" ? ReadOnlyError : "SQL mutations do not support in-memory-writes mode",
          );
        }

        // Then even the empty VALUES array checks write permissions before returning or issuing SQL
        expect(queries).toMatchInlineSnapshot(`[]`);
        expect(em.entities).toEqual([]);
      },
    );

    it.each(["read-only", "in-memory-writes"] as const)("allows execute reads in %s mode", async (mode) => {
      // Given a persisted Tag that can be read without writing any entities
      await insertTag({ name: "Readable" });
      const em = newEntityManager();
      const t = table(Tag);
      // And the EntityManager disallows SQL mutations but still permits database reads
      em.mode = mode;
      resetQueryCount();

      // When executing a reusable named read
      const named = await em.execute(query({ from: t, select: { id: t.id, name: t.name } }));
      // And an ordinary scalar-select POJO uses the same read permissions
      const scalar = await em.execute({ from: t, select: t.name });

      // Then both reads retain native counts and decoding without hydrating or flushing entities
      expect(named).toEqual({ rowCount: 1, rows: [{ id: "t:1", name: "Readable" }] });
      expect(scalar).toEqual({ rowCount: 1, rows: ["Readable"] });
      expect(em.entities).toEqual([]);

      // When an ordinary entity-select read uses execute instead of mutation RETURNING
      const entities = await em.execute({ from: t, select: t });

      // Then read-only permissions still allow the existing managed-entity read behavior
      expect(entities.rowCount).toBe(1);
      expect(entities.rows).toMatchEntity([{ id: "t:1", name: "Readable" }]);
      expect(em.entities).toEqual(entities.rows);
      expect(queries).toMatchInlineSnapshot(`
        [
          "SELECT t.id AS id, t.name AS name FROM tags AS t",
          "SELECT t.name AS value FROM tags AS t",
          "SELECT t.* FROM tags AS t",
        ]
      `);
    });

    it("does not let execute reads bypass the regular validation-rule guard", async () => {
      // Given an AuthorSchedule whose regular rule is configured to attempt a database read
      const em = newEntityManager();
      const schedule = newAuthorSchedule(em);
      // And the fixture's opt-in rule runs before its AuthorSchedule has been inserted
      schedule.transientFields.tryFindInRegularRule = true;
      const s = table(AuthorSchedule);
      // And the existing rule's find call is routed through execute instead of changing fixture configuration
      const find = jest.spyOn(em, "find").mockImplementation(async () => {
        resetQueryCount();
        await em.execute({ from: s, select: s.id });
        return [];
      });

      try {
        // When flush invokes the regular rule against pending state
        await expect(em.flush()).rejects.toThrow(
          "em.execute cannot be called from a validation rule (added via config.addRule)",
        );

        // Then the execute entry point rejects the read before any validation-time SQL
        expect(find).toHaveBeenCalledWith(AuthorSchedule, {});
        expect(queries).toMatchInlineSnapshot(`[]`);
        expect(schedule.isNewEntity).toBe(true);
      } finally {
        find.mockRestore();
      }
    });

    it("rejects external mutations while an Author hook holds the flush lock, but permits reads", async () => {
      // Given a persisted Author whose pending name change requires a flush
      await insertAuthor({ first_name: "Original" });
      const em = newEntityManager();
      // And the Author is loaded before its name is changed in memory
      const author = await em.load(Author, "a:1");
      // And the pending value must remain in memory until the Author hook completes
      author.firstName = "Flushed";
      const a = table(Author);
      const t = table(Tag);
      // And the existing beforeFlush API hook pauses deterministically without a timer
      const entered = new Deferred<void>();
      const release = new Deferred<void>();
      const hook = jest.spyOn(em.ctx, "makeApiCall").mockImplementationOnce(async () => {
        entered.resolve();
        await release.promise;
      });
      // And valid mutation shapes include an empty import that must not bypass the lock
      const statements = [
        { insert: t, values: { name: "Forbidden" } },
        { update: t, set: { name: "Forbidden" }, where: t.id.eq("t:1") },
        { delete: t, where: t.id.eq("t:1") },
        { insert: t, values: [] },
      ] as const;

      // When flush reaches the paused hook and application code tries to write outside its context
      const flushing = em.flush();
      try {
        await Promise.race([entered.promise, flushing]);
        resetQueryCount();
        for (const statement of statements) {
          await expect(em.execute(statement)).rejects.toThrow(
            "Cannot mutate an entity during an em.flush outside of a entity hook or from afterCommit",
          );
        }

        // Then no external mutation reaches the driver while the flush is paused
        expect(hook).toHaveBeenCalledWith("Author.beforeFlush");
        expect(queries).toMatchInlineSnapshot(`[]`);

        // When a read executes during the hook rather than during a validation rule
        const read = await em.execute({ from: a, select: a.first_name });

        // Then it sees persisted state without flushing the pending name
        expect(read).toEqual({ rowCount: 1, rows: ["Original"] });
        expect(queries).toMatchInlineSnapshot(`
          [
            "SELECT a.first_name AS value FROM authors AS a WHERE a.deleted_at IS NULL",
          ]
        `);
      } finally {
        release.resolve();
        hook.mockRestore();
        await flushing;
      }

      // And completing the hook releases the lock for the next application write
      resetQueryCount();
      const inserted = await em.execute({ insert: t, values: { name: "After flush" } });

      // Then ordinary immediate writes work again after the flush completes
      expect(inserted).toEqual({ rowCount: 1, rows: [] });
      expect(queries).toMatchInlineSnapshot(`
        [
          "INSERT INTO tags AS t (name) VALUES ($1)",
        ]
      `);
      expect(await select("authors")).toMatchObject([{ first_name: "Flushed" }]);
    });
  });

  describe("driver boundary", () => {
    it("keeps query rows-only while the driver returns native command metadata", async () => {
      // Given a persisted Tag
      await insertTag({ name: "Readable" });
      // And a separate driver records this EntityManager's result envelopes
      const em = newEntityManager();
      const t = table(Tag);
      em.driver = new PostgresDriver(pool, { onQuery: recordQuery });
      const execute = jest.spyOn(em.driver, "executeQuery");
      resetQueryCount();

      try {
        // When an ordinary query reads through the driver
        const rows = await em.query({ from: t, select: { id: t.id, name: t.name } });

        // Then EntityManager.query decodes only the rows from the driver's envelope
        expect(rows).toEqual([{ id: "t:1", name: "Readable" }]);
        expect(execute).toHaveBeenCalledTimes(1);
        await expect(execute.mock.results[0].value).resolves.toEqual({
          rowCount: 1,
          rows: [{ id: 1, name: "Readable" }],
        });
        expect(queries).toMatchInlineSnapshot(`
          [
            "SELECT t.id AS id, t.name AS name FROM tags AS t",
          ]
        `);
        expect(await select("tags")).toMatchObject([{ name: "Readable" }]);
      } finally {
        execute.mockRestore();
      }
    });

    it("preserves native null command counts for DDL", async () => {
      // Given an EntityManager connected to PostgreSQL
      const em = newEntityManager();

      // When DDL runs inside a transaction so the temporary table is removed at commit
      await em.transaction(async () => {
        const result = await em.driver.executeQuery(
          em,
          "CREATE TEMP TABLE driver_result_test (id int) ON COMMIT DROP",
          [],
        );

        // Then commands without counts remain valid through the driver API
        expect(result).toEqual({ rowCount: null, rows: [] });
      });
    });

    it.each([null, undefined, "1", -1, 1.5, NaN, Infinity, -Infinity])(
      "rejects an invalid native command count of %s even when RETURNING has a row",
      async (rowCount) => {
        // Given a native PostgreSQL response whose count is invalid despite returning one Tag name
        const em = newEntityManager();
        const t = table(Tag);
        // And only the native response is replaced, leaving the real EM and PostgresDriver checks in place
        const native = jest.spyOn(pool, "query").mockImplementationOnce(async () => ({
          command: "UPDATE",
          rowCount,
          oid: 0,
          fields: [],
          rows: [{ value: "Changed" }],
        }));
        resetQueryCount();

        try {
          // When execute receives the malformed count through the native driver path
          await expect(
            em.execute({ update: t, set: { name: "Changed" }, where: t.id.eq("t:1"), returning: t.name }),
          ).rejects.toThrow("The driver did not return a numeric command rowCount");

          // Then returned rows cannot manufacture a successful command count
          expect(native).toHaveBeenCalledTimes(1);
          expect(queries).toMatchInlineSnapshot(`
            [
              "UPDATE tags AS t SET name = $1 WHERE (t.id = $2) RETURNING t.name AS value",
            ]
          `);
          expect(em.entities).toEqual([]);
        } finally {
          native.mockRestore();
        }
      },
    );
  });

  describe("transactions", () => {
    it("routes autocommit through the pool without starting a hidden transaction", async () => {
      // Given a persisted Tag and an EntityManager without an active transaction
      await insertTag({ name: "Original" });
      const em = newEntityManager();
      const t = table(Tag);
      // And the native pool and transaction entry point are observed without replacing their behavior
      const native = jest.spyOn(pool, "query");
      const transaction = jest.spyOn(em.driver, "transaction");
      resetQueryCount();

      try {
        // When an immediate write executes outside em.transaction
        const result = await em.execute({
          update: t,
          set: { name: "Committed" },
          where: t.id.eq("t:1"),
          returning: t.name,
        });

        // Then the pool receives exactly one parameterized command without BEGIN or SAVEPOINT
        expect(result).toEqual({ rowCount: 1, rows: ["Committed"] });
        expect(transaction).not.toHaveBeenCalled();
        expect(em.txn).toBeUndefined();
        expect(native.mock.calls).toMatchInlineSnapshot(`
          [
            [
              "UPDATE tags AS t SET name = $1 WHERE (t.id = $2) RETURNING t.name AS value",
              [
                "Committed",
                1,
              ],
            ],
          ]
        `);
        expect(queries).toMatchInlineSnapshot(`
          [
            "UPDATE tags AS t SET name = $1 WHERE (t.id = $2) RETURNING t.name AS value",
          ]
        `);
      } finally {
        native.mockRestore();
        transaction.mockRestore();
      }
      expect(await newEntityManager().query({ from: t, select: t.name })).toEqual(["Committed"]);
    });

    it("routes execute reads and writes to the active native client and isolates uncommitted state", async () => {
      // Given a persisted Tag whose committed name is visible to other connections
      await insertTag({ name: "Original" });
      const em = newEntityManager();
      const t = table(Tag);
      // And a separate EntityManager has neither this transaction nor any cached Tags
      const observer = newEntityManager();
      resetQueryCount();

      // When a transaction updates the Tag and immediately reads its own write
      const result = await em.transaction(async (txn) => {
        // And native routing is observed only after the explicit transaction has begun
        const native = jest.spyOn(txn, "query");
        const autocommit = jest.spyOn(pool, "query");
        try {
          const updated = await em.execute({
            update: t,
            set: { name: "Committed" },
            where: t.id.eq("t:1"),
            returning: t.name,
          });
          // And a metadata-bearing read must use the same uncommitted client
          const read = await em.execute({ from: t, select: t.name });

          // Then both statements use the callback's native client rather than the autocommit pool
          expect(em.txn).toBe(txn);
          expect(updated).toEqual({ rowCount: 1, rows: ["Committed"] });
          expect(read).toEqual({ rowCount: 1, rows: ["Committed"] });
          expect(autocommit).not.toHaveBeenCalled();
          expect(native.mock.calls).toMatchInlineSnapshot(`
            [
              [
                "UPDATE tags AS t SET name = $1 WHERE (t.id = $2) RETURNING t.name AS value",
                [
                  "Committed",
                  1,
                ],
              ],
              [
                "SELECT t.name AS value FROM tags AS t",
                [],
              ],
            ]
          `);
        } finally {
          native.mockRestore();
          autocommit.mockRestore();
        }

        // Then the separate EntityManager still sees the old name until this callback commits
        expect(observer.txn).toBeUndefined();
        expect(await observer.query({ from: t, select: t.name })).toEqual(["Original"]);
        return "callback result";
      });

      // Then transaction completion preserves the callback result without adding nested transactions
      expect(result).toBe("callback result");
      expect(em.txn).toBeUndefined();
      expect(queries).toMatchInlineSnapshot(`
        [
          "BEGIN;",
          "UPDATE tags AS t SET name = $1 WHERE (t.id = $2) RETURNING t.name AS value",
          "SELECT t.name AS value FROM tags AS t",
          "SELECT t.name AS value FROM tags AS t",
          "COMMIT;",
        ]
      `);
      expect(await observer.query({ from: t, select: t.name })).toEqual(["Committed"]);
      expect(observer.entities).toEqual([]);
    });

    it("rolls back an UPDATE when a real Author RETURNING decoder error leaves the transaction callback", async () => {
      // Given an Author whose persisted address has a numeric street instead of AddressSchema's required string
      await insertAuthor({ first_name: "Original", business_address: { street: 123 } });
      const em = newEntityManager();
      const a = table(Author);
      // And the native client is observed after BEGIN so rollback is visible even though onQuery does not log it
      let native: jest.SpyInstance | undefined;
      em.afterBegin((_, txn) => {
        native = jest.spyOn(txn, "query");
      });
      resetQueryCount();

      try {
        // When UPDATE changes the name but RETURNING tries to decode the deliberately invalid address
        const result = em.transaction(async () => {
          await em.execute({
            update: a,
            set: { first_name: "Rolled back" },
            where: a.id.eq("a:1"),
            returning: a.business_address,
          });
        });

        // Then the real Zod failure propagates out of the callback and rolls back on the same native client
        await expect(result).rejects.toThrow(ZodError);
        expect(em.txn).toBeUndefined();
        expect(em.entities).toEqual([]);
        expect(native!.mock.calls).toMatchInlineSnapshot(`
          [
            [
              "UPDATE authors AS a SET first_name = $1 WHERE (a.id = $2) AND (a.deleted_at IS NULL) RETURNING a.business_address AS value",
              [
                "Rolled back",
                1,
              ],
            ],
            [
              "ROLLBACK",
            ],
          ]
        `);
        expect(queries).toMatchInlineSnapshot(`
          [
            "BEGIN;",
            "UPDATE authors AS a SET first_name = $1 WHERE (a.id = $2) AND (a.deleted_at IS NULL) RETURNING a.business_address AS value",
          ]
        `);
      } finally {
        native?.mockRestore();
      }

      // Then a separate connection confirms rollback without hydrating the still-invalid address
      expect(await select("authors")).toMatchObject([{ first_name: "Original", business_address: { street: 123 } }]);
      expect(await newEntityManager().query({ from: a, select: a.first_name })).toEqual(["Original"]);
    });

    it("does not flush during execute but retains the existing transaction-end flush", async () => {
      // Given a persisted Tag that will be updated by immediate SQL
      await insertTag({ name: "Original" });
      const em = newEntityManager();
      const t = table(Tag);
      // And a new Tag has an assigned id but has not been inserted into the database
      const pending = em.create(Tag, { id: "t:10", name: "Pending" });
      // And flush is observed without replacing its normal transaction-end behavior
      const flush = jest.spyOn(em, "flush");
      resetQueryCount();

      try {
        // When execute writes within a transaction that also owns pending entity work
        await em.transaction(async () => {
          const updated = await em.execute({ update: t, set: { name: "Immediate" }, where: t.id.eq("t:1") });
          // And an execute read runs before the callback returns
          const read = await em.execute({ from: t, select: { id: t.id, name: t.name }, orderBy: [{ asc: t.id }] });

          // Then execute has neither flushed the pending Tag nor made it visible within the transaction
          expect(updated).toEqual({ rowCount: 1, rows: [] });
          expect(read).toEqual({ rowCount: 1, rows: [{ id: "t:1", name: "Immediate" }] });
          expect(flush).not.toHaveBeenCalled();
          expect(pending.isNewEntity).toBe(true);
        });

        // Then returning from the callback still flushes pending entities once before COMMIT
        expect(flush).toHaveBeenCalledTimes(1);
        expect(pending.isNewEntity).toBe(false);
        expect(queries).toMatchInlineSnapshot(`
          [
            "BEGIN;",
            "UPDATE tags AS t SET name = $1 WHERE (t.id = $2)",
            "SELECT t.id AS id, t.name AS name FROM tags AS t ORDER BY t.id ASC",
            "WITH data AS (SELECT unnest($1::int[]) as id, unnest($2::citext[]) as name, unnest($3::timestamp with time zone[]) as created_at, unnest($4::timestamp with time zone[]) as updated_at) INSERT INTO tags (id, name, created_at, updated_at) SELECT * FROM data",
            "COMMIT;",
          ]
        `);
      } finally {
        flush.mockRestore();
      }
      expect(
        await newEntityManager().query({ from: t, select: { id: t.id, name: t.name }, orderBy: [{ asc: t.id }] }),
      ).toEqual([
        { id: "t:1", name: "Immediate" },
        { id: "t:10", name: "Pending" },
      ]);
    });
  });

  describe("unit of work and caches", () => {
    it("does not autoflush pending creates or dirty entities for execute writes or reads", async () => {
      // Given a persisted Tag with no pending database changes
      await insertTag({ name: "Original" });
      const em = newEntityManager();
      // And the Tag is loaded before its managed name diverges from its stored name
      const loaded = await em.load(Tag, "t:1");
      const t = table(Tag);
      // And the managed Tag has a pending name that differs from the immediate SQL assignment
      loaded.name = "Pending edit";
      // And an unflushed Author violates the first-name/last-name rule if execute were to trigger validation
      const pending = em.create(Author, { firstName: "Same", lastName: "Same" });
      // And the real flush method remains observable so an implicit flush cannot pass unnoticed
      const flush = jest.spyOn(em, "flush");
      resetQueryCount();

      try {
        // When immediate SQL updates the physical Tag without touching pending entity work
        const updated = await em.execute({ update: t, set: { name: "Immediate" }, where: t.id.eq("t:1") });
        // And a metadata-bearing read observes the database rather than the dirty managed Tag
        const read = await em.execute({ from: t, select: t.name });

        // Then neither entry point flushes, validates, runs Author hooks, or overwrites pending entity values
        expect(updated).toEqual({ rowCount: 1, rows: [] });
        expect(read).toEqual({ rowCount: 1, rows: ["Immediate"] });
        expect(flush).not.toHaveBeenCalled();
        expect(loaded).toMatchEntity({ name: "Pending edit" });
        expect(loaded.isDirtyEntity).toBe(true);
        expect(pending.isNewEntity).toBe(true);
        expect(pending.transientFields.beforeFlushRan).toBe(false);
        expect(pending.transientFields.firstIsNotLastNameRuleInvoked).toBe(0);
        expect(queries).toMatchInlineSnapshot(`
          [
            "UPDATE tags AS t SET name = $1 WHERE (t.id = $2)",
            "SELECT t.name AS value FROM tags AS t",
          ]
        `);
        expect(await select("tags")).toMatchObject([{ name: "Immediate" }]);
        expect(await select("authors")).toEqual([]);
      } finally {
        flush.mockRestore();
      }
    });

    it("leaves loaded entities and find caches stale while raw results remain isolated", async () => {
      // Given a persisted Author and its Book
      await insertAuthor({ first_name: "Owner" });
      // And the Book initially matches the title that will be cached by find
      await insertBook({ title: "Original", author_id: 1 });
      const em = newEntityManager();
      const b = table(Book);
      // And the Author's collection already contains the managed Book
      const author = await em.load(Author, "a:1", "books");
      const book = author.books.get[0];
      // And a find cache records the Book under its original title
      const cached = await em.find(Book, { title: "Original" });
      resetQueryCount();

      // When a raw UPDATE changes the title and returns an ordinary POJO
      const updated = await em.execute({
        update: b,
        set: { title: "Changed" },
        where: b.id.eq("b:1"),
        returning: { id: b.id, title: b.title },
      });

      // Then RETURNING does not hydrate or repair the identity map, loaded collection, or find cache
      expect(updated).toEqual({ rowCount: 1, rows: [{ id: "b:1", title: "Changed" }] });
      expect(book).toMatchEntity({ title: "Original" });
      expect(author.books.get).toEqual([book]);
      expect(await em.find(Book, { title: "Original" })).toEqual(cached);
      expect(em.entities).toEqual([author, book]);
      expect(queries).toMatchInlineSnapshot(`
        [
          "UPDATE books AS b SET title = $1 WHERE (b.id = $2) AND (b.deleted_at IS NULL) RETURNING b.id AS id, b.title AS title",
        ]
      `);

      // And changing the returned POJO is only a local result mutation, not an entity setter or database write
      Object.assign(updated.rows[0], { title: "Result only" });
      // And a fresh EntityManager has no identity-map or find-cache entries to reuse
      const isolated = newEntityManager();
      resetQueryCount();

      // When raw reads inspect both the original EntityManager and an isolated one
      const sameEm = await em.execute({ from: b, select: { id: b.id, title: b.title } });
      // And the isolated EntityManager reads the current title without using managed entities
      const fresh = await isolated.query({ from: b, select: { id: b.id, title: b.title } });
      // And the original cached predicate is checked against physical state rather than the old find result
      const oldTitle = await isolated.query({ from: b, where: b.title.eq("Original"), select: b.id });

      // Then raw reads see physical state without sharing mutable RETURNING results or repairing managed entities
      expect(sameEm).toEqual({ rowCount: 1, rows: [{ id: "b:1", title: "Changed" }] });
      expect(fresh).toEqual([{ id: "b:1", title: "Changed" }]);
      expect(oldTitle).toEqual([]);
      expect(updated.rows).toEqual([{ id: "b:1", title: "Result only" }]);
      expect(book).toMatchEntity({ title: "Original" });
      expect(book.isDirtyEntity).toBe(false);
      expect(isolated.entities).toEqual([]);
      expect(queries).toMatchInlineSnapshot(`
        [
          "SELECT b.id AS id, b.title AS title FROM books AS b WHERE b.deleted_at IS NULL",
          "SELECT b.id AS id, b.title AS title FROM books AS b WHERE b.deleted_at IS NULL",
          "SELECT b.id AS value FROM books AS b WHERE b.title = $1 AND b.deleted_at IS NULL",
        ]
      `);
    });
  });
});
