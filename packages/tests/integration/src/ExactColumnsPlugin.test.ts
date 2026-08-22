import { type EntityManager, ExactColumnsPlugin, StaleColumnUsageError } from "joist-orm";
import { Author, ParentGroup, Publisher, Task } from "src/entities";
import { insertAuthor, insertBook, insertParentGroup, insertPublisher, insertTask, select } from "src/entities/inserts";
import { isPreloadingEnabled, newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("ExactColumnsPlugin", () => {
  it("learns for five invocations by default, then narrows to used columns", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    const plugin = new ExactColumnsPlugin();
    async function endpoint(em: EntityManager): Promise<void> {
      const a = await em.load(Author, "a:1");
      expect(a.firstName).toBe("a1");
    }
    for (let i = 0; i < 4; i++) {
      await invoke(plugin, "get-author", endpoint);
    }
    // The 5th invocation is still learning, so it does a full select *
    resetQueryCount();
    await invoke(plugin, "get-author", endpoint);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT "a".* FROM authors AS a WHERE a.id = ANY($1) ORDER BY a.id ASC LIMIT $2",
     ]
    `);
    // The 6th invocation narrows to `firstName` + the always-kept pk/FK/timestamp columns
    resetQueryCount();
    await invoke(plugin, "get-author", endpoint);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT a.id, a.first_name, a.deleted_at, a.created_at, a.updated_at FROM authors AS a WHERE a.id = ANY($1) ORDER BY a.id ASC LIMIT $2",
     ]
    `);
  });

  it("narrows em.find selects", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    const plugin = new ExactColumnsPlugin({ learnFor: 1 });
    async function endpoint(em: EntityManager): Promise<void> {
      const [a] = await em.find(Author, { firstName: "a1" });
      expect(a.firstName).toBe("a1");
    }
    await invoke(plugin, "find-authors", endpoint);
    resetQueryCount();
    await invoke(plugin, "find-authors", endpoint);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT a.id, a.first_name, a.deleted_at, a.created_at, a.updated_at FROM authors AS a WHERE a.deleted_at IS NULL AND a.first_name = $1 ORDER BY a.id ASC LIMIT $2",
     ]
    `);
  });

  it("collapses batched narrowed finds to a primary-key group by", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    const plugin = new ExactColumnsPlugin({ learnFor: 1 });
    async function endpoint(em: EntityManager): Promise<void> {
      const [[a1], [a2]] = await Promise.all([
        em.find(Author, { firstName: "a1" }),
        em.find(Author, { firstName: "a2" }),
      ]);
      expect(a1.firstName).toBe("a1");
      expect(a2.firstName).toBe("a2");
    }
    await invoke(plugin, "find-two", endpoint);
    resetQueryCount();
    await invoke(plugin, "find-two", endpoint);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0) AS (SELECT unnest($1::int[]), unnest($2::character varying[])) SELECT array_agg(_find.tag) as _tags, a.id, a.first_name, a.deleted_at, a.created_at, a.updated_at FROM authors AS a CROSS JOIN _find AS _find WHERE a.deleted_at IS NULL AND a.first_name = _find.arg0 GROUP BY a.id ORDER BY a.id ASC LIMIT $3",
     ]
    `);
  });

  it("narrows o2m relation loads", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 1 });
    const plugin = new ExactColumnsPlugin({ learnFor: 1 });
    async function endpoint(em: EntityManager): Promise<string[]> {
      const a = await em.load(Author, "a:1");
      const books = await a.books.load();
      return books.map((b) => b.title);
    }
    await invoke(plugin, "get-books", endpoint);
    resetQueryCount();
    const titles = await invoke(plugin, "get-books", endpoint);
    expect(titles).toEqual(["b1", "b2"]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT "a".* FROM authors AS a WHERE a.id = ANY($1) ORDER BY a.id ASC LIMIT $2",
       "SELECT b.id, b.title, b."order", b.deleted_at, b.created_at, b.updated_at, b.author_id FROM books AS b WHERE b.author_id = ANY($1) ORDER BY b.id ASC LIMIT $2",
     ]
    `);
  });

  it("tracks FK columns like any other field", async () => {
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    const plugin = new ExactColumnsPlugin({ learnFor: 1 });
    async function endpoint(em: EntityManager): Promise<string> {
      const a = await em.load(Author, "a:1");
      // Traversing publisher reads its FK, so publisher_id stays while the other FKs prune
      const p = await a.publisher.load();
      return p!.name;
    }
    await invoke(plugin, "get-publisher-name", endpoint);
    resetQueryCount();
    await expect(invoke(plugin, "get-publisher-name", endpoint)).resolves.toBe("p1");
    expect(queries[0]).toMatchInlineSnapshot(
      `"SELECT a.id, a.deleted_at, a.created_at, a.updated_at, a.publisher_id FROM authors AS a WHERE a.id = ANY($1) ORDER BY a.id ASC LIMIT $2"`,
    );
  });

  it("throws StaleColumnUsageError on a novel field read and retries with full rows", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    const stales: StaleColumnUsageError[] = [];
    const plugin = new ExactColumnsPlugin({ learnFor: 1, onStale: (err) => stales.push(err) });
    async function endpoint(em: EntityManager, readLast: boolean): Promise<string | undefined> {
      const a = await em.load(Author, "a:1");
      return readLast ? a.lastName : a.firstName;
    }
    await invoke(plugin, "get-author", (em) => endpoint(em, false));
    // The 2nd invocation takes a novel branch; track sees the stale, widens, and re-invokes with full rows
    resetQueryCount();
    await expect(invoke(plugin, "get-author", (em) => endpoint(em, true))).resolves.toBe("l1");
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT a.id, a.first_name, a.deleted_at, a.created_at, a.updated_at FROM authors AS a WHERE a.id = ANY($1) ORDER BY a.id ASC LIMIT $2",
       "SELECT "a".* FROM authors AS a WHERE a.id = ANY($1) ORDER BY a.id ASC LIMIT $2",
     ]
    `);
    expect(stales).toMatchObject([{ fieldName: "lastName", endpointKey: "get-author" }]);
    // The 3rd invocation's narrowed select now includes `last_name`
    resetQueryCount();
    await expect(invoke(plugin, "get-author", (em) => endpoint(em, true))).resolves.toBe("l1");
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT a.id, a.first_name, a.last_name, a.deleted_at, a.created_at, a.updated_at FROM authors AS a WHERE a.id = ANY($1) ORDER BY a.id ASC LIMIT $2",
     ]
    `);
    expect(plugin.getReport()).toMatchObject({ "get-author": { invocations: 3, staleRetries: 1 } });
  });

  it("keeps throwing when user code swallows the stale error", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    const plugin = new ExactColumnsPlugin({ learnFor: 1 });
    async function endpoint(em: EntityManager, readLast: boolean): Promise<void> {
      const a = await em.load(Author, "a:1");
      expect(a.firstName).toBe("a1");
      if (readLast) {
        // Swallowing the error must not cache an undefined value; later reads keep throwing
        try {
          expect(a.lastName).toBe("unreachable");
        } catch {}
        expect(() => a.lastName).toThrow(StaleColumnUsageError);
        expect(() => a.lastName).toThrow(`Author:1.lastName was read, but its column was not fetched`);
      }
    }
    await invoke(plugin, "get-author", (em) => endpoint(em, false));
    await invoke(plugin, "get-author", (em) => endpoint(em, true));
  });

  it("flushes narrowed entities without clobbering unfetched columns", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1", age: 40 });
    const plugin = new ExactColumnsPlugin({ learnFor: 1 });
    async function endpoint(em: EntityManager, firstName: string): Promise<void> {
      const a = await em.load(Author, "a:1");
      a.firstName = firstName;
      await em.flush();
    }
    await invoke(plugin, "rename-author", (em) => endpoint(em, "a2"));
    await invoke(plugin, "rename-author", (em) => endpoint(em, "a3"));
    // The narrowed 2nd invocation updated first_name without nulling the unfetched columns
    expect(await select("authors")).toMatchObject([{ id: 1, first_name: "a3", last_name: "l1", age: 40 }]);
    expect(plugin.getReport()).toMatchObject({ "rename-author": { invocations: 2, staleRetries: 0 } });
  });

  it("does not auto-retry a stale after a committed flush", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1", age: 40 });
    const stales: StaleColumnUsageError[] = [];
    const plugin = new ExactColumnsPlugin({ learnFor: 1, onStale: (err) => stales.push(err) });
    async function endpoint(em: EntityManager, firstName: string, readAge: boolean): Promise<void> {
      const a = await em.load(Author, "a:1");
      a.firstName = firstName;
      await em.flush();
      // readAge purposefully reads a column the narrowed invocation didn't fetch, i.e. to trigger
      // a stale after the flush above has already committed
      if (readAge) expect(a.age).toBe(40);
    }
    await invoke(plugin, "rename-author", (em) => endpoint(em, "a2", false));
    // Rejecting is what proves there was no retry: a retry re-runs `endpoint` with full rows, so
    // `a.age` would succeed and this invocation would resolve (as the 3rd invocation shows below)
    await expect(invoke(plugin, "rename-author", (em) => endpoint(em, "a3", true))).rejects.toThrow(
      StaleColumnUsageError,
    );
    // The write that preceded the stale stayed committed, i.e. the failure did not roll it back
    expect(await select("authors")).toMatchObject([{ id: 1, first_name: "a3", last_name: "l1" }]);
    expect(stales).toMatchObject([{ fieldName: "age", endpointKey: "rename-author" }]);
    // The profile still widened, so the 3rd invocation fetches age and succeeds
    await invoke(plugin, "rename-author", (em) => endpoint(em, "a4", true));
    expect(plugin.getReport()).toMatchObject({
      "rename-author": { invocations: 3, staleRetries: 0, staleFailures: 1 },
    });
  });

  it("covers cross-entity batch updates via per-type recording", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1", age: 40 });
    await insertAuthor({ first_name: "a2", last_name: "l2", age: 50 });
    const plugin = new ExactColumnsPlugin({ learnFor: 1 });
    async function endpoint(em: EntityManager, suffix: string, isFunny: boolean): Promise<void> {
      const [a1, a2] = await em.loadAll(Author, ["a:1", "a:2"]);
      // a1 changes firstName and a2 changes isFunny, so the batch UPDATE's column union
      // spans both fields; per-type recording ensures both columns were fetched for both rows
      a1.firstName = `a1${suffix}`;
      a2.isFunny = isFunny;
      await em.flush();
    }
    await invoke(plugin, "rename-both", (em) => endpoint(em, "-x", true));
    await invoke(plugin, "rename-both", (em) => endpoint(em, "-y", false));
    expect(await select("authors")).toMatchObject([
      { id: 1, first_name: "a1-y", last_name: "l1", age: 40, is_funny: false },
      { id: 2, first_name: "a2", last_name: "l2", age: 50, is_funny: false },
    ]);
    expect(plugin.getReport()).toMatchObject({ "rename-both": { invocations: 2, staleRetries: 0 } });
  });

  it("re-fetches full rows on em.refresh", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1", age: 40 });
    const plugin = new ExactColumnsPlugin({ learnFor: 1 });
    async function endpoint(em: EntityManager, readAge: boolean): Promise<void> {
      const a = await em.load(Author, "a:1");
      expect(a.firstName).toBe("a1");
      await em.refresh(a);
      // The refresh re-fetched the full row, so even never-recorded columns are readable
      if (readAge) expect(a.age).toBe(40);
    }
    await invoke(plugin, "get-author", (em) => endpoint(em, false));
    resetQueryCount();
    await invoke(plugin, "get-author", (em) => endpoint(em, true));
    // The initial load is narrowed (including refresh-read FKs like mentor_id), then the refresh
    // re-fetches full rows; its SQL differs under join-preloading (laterals), so only snapshot stock
    if (!isPreloadingEnabled) {
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.id, a.first_name, a.deleted_at, a.created_at, a.updated_at, a.mentor_id, a.current_draft_book_id, a.publisher_id FROM authors AS a WHERE a.id = ANY($1) ORDER BY a.id ASC LIMIT $2",
         "SELECT "a".* FROM authors AS a WHERE a.id = ANY($1) ORDER BY a.id ASC LIMIT $2",
         "WITH RECURSIVE a_cte AS (SELECT b.id, b.mentor_id FROM authors b WHERE b.id = ANY($1) UNION SELECT r.id, r.mentor_id FROM authors r JOIN a_cte ON r.id = a_cte.mentor_id) SELECT "a".* FROM authors AS a JOIN a_cte AS a_cte ON a.id = a_cte.id ORDER BY a.id ASC LIMIT $2",
       ]
      `);
    }
    expect(plugin.getReport()).toMatchObject({ "get-author": { invocations: 2, staleRetries: 0 } });
  });

  it("guards forked partial entities", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    const plugin = new ExactColumnsPlugin({ learnFor: 1 });
    async function endpoint(em: EntityManager, fork: boolean): Promise<void> {
      const a = await em.load(Author, "a:1");
      expect(a.firstName).toBe("a1");
      if (fork) {
        const forked = await em.fork().load(Author, "a:1");
        // The forked entity keeps its fetched columns, and fails loudly on unfetched ones
        expect(forked.firstName).toBe("a1");
        expect(() => forked.lastName).toThrow(StaleColumnUsageError);
      }
    }
    await invoke(plugin, "get-author", (em) => endpoint(em, false));
    await invoke(plugin, "get-author", (em) => endpoint(em, true));
  });

  it("converges em.clone in one retry", async () => {
    await insertAuthor({ first_name: "a1", last_name: "l1", age: 40 });
    const plugin = new ExactColumnsPlugin({ learnFor: 1 });
    async function endpoint(em: EntityManager, clone: boolean): Promise<void> {
      const a = await em.load(Author, "a:1");
      expect(a.firstName).toBe("a1");
      // Cloning reads every field, so the narrowed 2nd invocation stales once, then retries fully
      if (clone) expect((await em.clone(a)).lastName).toBe("l1");
    }
    await invoke(plugin, "get-author", (em) => endpoint(em, false));
    await invoke(plugin, "get-author", (em) => endpoint(em, true));
    expect(plugin.getReport()).toMatchObject({ "get-author": { invocations: 2, staleRetries: 1 } });
  });

  it("never narrows STI or CTI entities", async () => {
    await insertTask({ type: "NEW" });
    await insertPublisher({ name: "p1" });
    const plugin = new ExactColumnsPlugin({ learnFor: 1 });
    async function endpoint(em: EntityManager): Promise<void> {
      const t = await em.load(Task, "task:1");
      expect(t.durationInDays).toBe(0);
      const p = await em.load(Publisher, "p:1");
      expect(p.name).toBe("p1");
    }
    await invoke(plugin, "get-both", endpoint);
    // Both selects keep their `.*`s, i.e. STI discriminator probing and CTI joins stay intact
    resetQueryCount();
    await invoke(plugin, "get-both", endpoint);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT "t".* FROM tasks AS t WHERE t.id = ANY($1) ORDER BY t.id ASC LIMIT $2",
       "SELECT "p".*, p_s0.*, p_s1.*, p.id as id, COALESCE(p_s0.shared_column, p_s1.shared_column) as shared_column, CASE WHEN p_s0.id IS NOT NULL THEN 'LargePublisher' WHEN p_s1.id IS NOT NULL THEN 'SmallPublisher' ELSE '_' END as __class FROM publishers AS p LEFT OUTER JOIN large_publishers AS p_s0 ON p.id = p_s0.id LEFT OUTER JOIN small_publishers AS p_s1 ON p.id = p_s1.id WHERE p.id = ANY($1) ORDER BY p.id ASC LIMIT $2",
     ]
    `);
  });

  it("never narrows findByUnique", async () => {
    await insertAuthor({ first_name: "a1", ssn: "123-45-6789" });
    const plugin = new ExactColumnsPlugin({ learnFor: 1 });
    async function endpoint(em: EntityManager): Promise<void> {
      const a = await em.findByUnique(Author, { ssn: "123-45-6789" });
      expect(a!.firstName).toBe("a1");
    }
    await invoke(plugin, "by-ssn", endpoint);
    // findByUnique groups raw rows by the unique column, so it always fetches full rows
    resetQueryCount();
    await invoke(plugin, "by-ssn", endpoint);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT a.* FROM authors AS a WHERE a.deleted_at IS NULL AND a.ssn = ANY($1) LIMIT $2",
     ]
    `);
  });

  it("composes with lazy columns", async () => {
    await insertParentGroup({ name: "pg1", bulk_data: { key: "before" }, required_data: {} });
    const plugin = new ExactColumnsPlugin({ learnFor: 1 });
    async function endpoint(em: EntityManager, key: string): Promise<void> {
      const pg = await em.load(ParentGroup, "parentGroup:1");
      expect(pg.name).toBe("pg1");
      // Blind-writing an unloaded lazy column must not false-stale
      pg.bulkData.set({ key });
      await em.flush();
    }
    await invoke(plugin, "set-bulk", (em) => endpoint(em, "one"));
    resetQueryCount();
    await invoke(plugin, "set-bulk", (em) => endpoint(em, "two"));
    // The load still excludes the lazy columns (nothing else was prunable)
    expect(queries[0]).toMatchInlineSnapshot(
      `"SELECT pg.id, pg.name, pg.created_at, pg.updated_at FROM parent_groups AS pg WHERE pg.id = ANY($1) ORDER BY pg.id ASC LIMIT $2"`,
    );
    expect(await select("parent_groups")).toMatchObject([{ id: 1, name: "pg1", bulk_data: { key: "two" } }]);
    expect(plugin.getReport()).toMatchObject({ "set-bulk": { invocations: 2, staleRetries: 0 } });
  });

  it("hydrates populated children fully without false stales", async () => {
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "b1", author_id: 1 });
    const plugin = new ExactColumnsPlugin({ learnFor: 1 });
    async function endpoint(em: EntityManager): Promise<void> {
      const a = await em.load(Author, "a:1", "books");
      expect(a.books.get.map((b) => b.title)).toEqual(["b1"]);
    }
    await invoke(plugin, "get-author-books", endpoint);
    await invoke(plugin, "get-author-books", endpoint);
    expect(plugin.getReport()).toMatchObject({ "get-author-books": { invocations: 2, staleRetries: 0 } });
  });

  it("reports learned profiles", async () => {
    await insertAuthor({ first_name: "a1" });
    const plugin = new ExactColumnsPlugin({ learnFor: 1 });
    await invoke(plugin, "get-author", async (em) => {
      const a = await em.load(Author, "a:1");
      expect(a.firstName).toBe("a1");
    });
    expect(plugin.getReport()).toEqual({
      "get-author": { invocations: 1, staleRetries: 0, staleFailures: 0, entities: { Author: ["firstName"] } },
    });
  });
});

/** Runs `fn` as one tracked "endpoint" invocation with its own EM, i.e. like a web request. */
function invoke<T>(plugin: ExactColumnsPlugin, key: string, fn: (em: EntityManager) => Promise<T>): Promise<T> {
  return plugin.track(key, () => {
    const em = newEntityManager();
    em.addPlugin(plugin);
    return fn(em);
  });
}
