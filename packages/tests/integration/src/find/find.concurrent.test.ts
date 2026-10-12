import { type ParsedFindQuery, Plugin } from "joist-orm";
import { Author, SmallPublisher } from "src/entities";
import { insertAuthor, insertPublisher } from "src/entities/inserts";
import { isSqlite, newEntityManager, numberOfQueries, queries, resetQueryCount } from "src/testEm";

describe("em.find / concurrent", () => {
  it("returns each concurrent filter's matching Authors", async () => {
    // Given two Authors with different first names
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();
    resetQueryCount();

    // When both first-name filters execute concurrently
    const results = await Promise.all([em.find(Author, { firstName: "a1" }), em.find(Author, { firstName: "a2" })]);

    // Then each filter returns its matching Author
    expect(results.map((authors) => authors.map((author) => author.firstName))).toEqual([["a1"], ["a2"]]);

    // And PostgreSQL batches the filters while SQLite executes them individually
    expect(numberOfQueries).toBe(isSqlite ? 2 : 1);
    if (isSqlite) {
      // SQLite should keep ordinary single-filter statements instead of PostgreSQL batching SQL.
      expect(queries).toMatchInlineSnapshot(`
       [
         "SELECT a.* FROM authors AS a WHERE a.deleted_at IS NULL AND a.first_name = 'a1' ORDER BY a.id ASC LIMIT 50000.0",
         "SELECT a.* FROM authors AS a WHERE a.deleted_at IS NULL AND a.first_name = 'a2' ORDER BY a.id ASC LIMIT 50000.0",
       ]
      `);
    }
  });

  it("paginates each concurrent filter independently", async () => {
    // Given two Authors share each first name
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();

    // When each filter requests its second Author concurrently
    const options = { limit: 1, offset: 1, orderBy: { id: "ASC" as const } };
    const results = await Promise.all([
      em.find(Author, { firstName: "a1" }, options),
      em.find(Author, { firstName: "a2" }, options),
    ]);

    // Then each page contains the second matching Author
    expect(results.map((authors) => authors.map((author) => author.id))).toEqual([["a:2"], ["a:4"]]);
  });

  it("keeps concurrent counts separate", async () => {
    // Given two Authors share one first name and a third has another first name
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();

    // When both first names are counted concurrently
    const counts = await Promise.all([
      em.findCount(Author, { firstName: "a1" }),
      em.findCount(Author, { firstName: "a2" }),
    ]);

    // Then each count includes only its matching Authors
    expect(counts).toEqual([2, 1]);
  });

  it("reuses cached results for identical concurrent filters", async () => {
    // Given one persisted Author
    await insertAuthor({ first_name: "a1" });
    const em = newEntityManager();
    resetQueryCount();

    // When the same filter executes twice concurrently
    const results = await Promise.all([em.find(Author, { firstName: "a1" }), em.find(Author, { firstName: "a1" })]);

    // Then both callers share the cached result
    expect(results[0]).toBe(results[1]);

    // And caching avoids a second query on either backend
    expect(numberOfQueries).toBe(1);
  });

  it("passes the unbatched query AST to beforeFind plugins", async () => {
    class BeforeFindPlugin extends Plugin {
      tables: string[][] = [];
      beforeFind(_meta: unknown, operation: unknown, query: ParsedFindQuery): void {
        // Capture the query's tables at beforeFind-time
        if (operation === "find") this.tables.push(query.tables.map((table) => table.alias));
      }
    }

    // Given two Authors and a plugin that records the domain query tables
    await insertAuthor({ first_name: "a1", last_name: "l1" });
    await insertAuthor({ first_name: "a2", last_name: "l2" });
    const em = newEntityManager();
    const plugin = new BeforeFindPlugin();
    em.addPlugin(plugin);

    // When two different Author filters execute concurrently
    await Promise.all([
      em.find(Author, { firstName: "a1", lastName: "l1" }),
      em.find(Author, { firstName: "a2", lastName: "l2" }),
    ]);

    // Then the plugin only saw the pre-batched `authors a` table for each find, and not
    // PostgreSQL's more complicated `_find` structure
    expect(plugin.tables).toEqual([["a"], ["a"]]);
  });

  it("does not cache results incorrectly", async () => {
    // Given two Authors with different first names
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    const em = newEntityManager();

    // When we purposefully make two separate queries with the same structure
    const a1 = await em.find(Author, { firstName: "a1" });
    const a2 = await em.find(Author, { firstName: "a2" });

    // Then they didn't share the same cache
    expect(a1[0].firstName).toBe("a1");
    expect(a2[0].firstName).toBe("a2");
  });

  it("omits impossible entries while preserving viable finds", async () => {
    // Given a persisted Author belongs to p1 and another Publisher is new
    await insertPublisher({ name: "p1" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    const em = newEntityManager();
    const newPublisherEntity = em.create(SmallPublisher, {
      name: "p2",
      city: "c2",
      spotlightAuthor: em.create(Author, { firstName: "spotlight" }),
    });
    resetQueryCount();

    // When same-shaped finds for both Publishers execute together
    const [impossible, viable] = await Promise.all([
      em.find(Author, { publisher: newPublisherEntity }),
      em.find(Author, { publisher: "p:1" }),
    ]);

    // Then only the viable find enters the loader and queries the database
    expect(impossible).toEqual([]);
    expect(viable).toMatchEntity([{ firstName: "a1" }]);
    expect(numberOfQueries).toBe(1);
  });
});
