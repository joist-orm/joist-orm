import {
  type Entity,
  type ParsedExecuteQuery,
  type ParsedReadQuery,
  type ParsedSelectQuery,
  Plugin,
  type RowData,
  query,
  recursiveQuery,
  table,
  tagId,
  visitQuery,
} from "joist-orm";
import { Author, Book, Tag } from "src/entities";
import { insertAuthor, insertBook, insertTag } from "src/entities/inserts";
import { newEntityManager } from "src/testEm";

describe("query.plugins", () => {
  it("filters nested reads before aggregation", async () => {
    // Given an adult and a child, and an adult-only read policy
    await insertAuthor({ first_name: "Adult", age: 30 });
    await insertAuthor({ first_name: "Child", age: 12 });
    const em = newEntityManager();
    em.addPlugin(new AdultAuthors());
    // When a CTE counts authors through execute
    const a = table(Author);
    const counts = query({ from: a, select: { count: a.id.count() }, as: "counts" });
    const result = await em.execute({ with: [counts], from: counts, select: counts });
    // Then only the adult contributes
    expect(result).toEqual({ rowCount: 1, rows: [{ count: 1 }] });
  });

  it("keeps the parent when a joined row fails its policy", async () => {
    // Given a book written by a child
    await insertAuthor({ first_name: "Child", age: 12 });
    await insertBook({ title: "Book", author_id: 1 });
    const em = newEntityManager();
    em.addPlugin(new AdultAuthors());
    // When the author is left joined under the adult-only policy
    const a = table(Author);
    const b = table(Book);
    const rows = await em.query({
      from: b,
      join: [{ left: a, on: b.authorId.eq(a.id) }],
      select: { title: b.title, author: a.firstName },
    });
    // Then the book remains while the child author's data is hidden
    expect(rows).toEqual([{ title: "Book", author: undefined }]);
  });

  it("does not mutate a reusable query value", async () => {
    // Given an adult and a reusable query
    await insertAuthor({ first_name: "Adult", age: 30 });
    const a = table(Author);
    const names = query({ from: a, select: [a.firstName] });
    const em = newEntityManager();
    em.addPlugin(new AdultAuthors());
    await em.query(names);
    // When the same query is executed by another EM without policies
    await insertAuthor({ first_name: "Child", age: 12 });
    const rows = await newEntityManager().query(names);
    // Then it still sees both authors
    expect(rows).toEqual([{ firstName: "Adult" }, { firstName: "Child" }]);
  });

  it("lets plugins reject immediate writes before execution", async () => {
    // Given an author and a plugin that requires entity writes
    await insertAuthor({ first_name: "Author" });
    const em = newEntityManager();
    em.addPlugin(new EntityWritesOnly());
    // When execute attempts an immediate delete
    const a = table(Author);
    const result = em.execute({ delete: a, where: a.id.eq("a:1") });
    // Then the plugin rejects the write
    await expect(result).rejects.toThrow("Use entity writes");
  });

  it("observes only the outer CTE result with an afterQuery-only plugin", async () => {
    // Given two authors and a result observer without a beforeQuery hook
    await insertAuthor({ first_name: "Adult", age: 30 });
    await insertAuthor({ first_name: "Child", age: 12 });
    const em = newEntityManager();
    const observer = new ReadObserver();
    em.addPlugin(observer);
    // When execute reads an aggregate from a CTE
    const a = table(Author);
    const counts = query({ from: a, select: { count: a.id.count() }, as: "counts" });
    await em.execute({ with: [counts], from: counts, select: counts });
    // Then the observer receives one result, without separate callbacks for CTE rows
    expect(observer.results).toEqual([[{ count: 2 }]]);
  });

  it("observes the combined union result once", async () => {
    // Given an author selected by both union operands
    await insertAuthor({ first_name: "Author" });
    const em = newEntityManager();
    const observer = new ReadObserver();
    em.addPlugin(observer);
    // When query combines the overlapping reads
    const a = table(Author);
    await em.query({
      union: [
        { from: a, select: { name: a.firstName } },
        { from: a, select: { name: a.firstName } },
      ],
    });
    // Then the observer receives the deduplicated result rather than either operand's rows
    expect(observer.results).toEqual([[{ name: "Author" }]]);
  });

  it("makes auxiliary query data available before execute returns visible entities", async () => {
    // Given an adult and a child, with visibility determined by an auxiliary projection
    await insertAuthor({ first_name: "Adult", age: 30 });
    await insertAuthor({ first_name: "Child", age: 12 });
    const em = newEntityManager();
    em.addPlugin(new AdultVisibility());
    // When execute hydrates authors
    const a = table(Author);
    const result = await em.execute({ from: a, select: a });
    // Then visibility checks can use the data cached by afterQuery
    expect(result.rows.map((author) => author.firstName)).toEqual(["Adult"]);
  });

  it("allows auxiliary projections for plain object queries", async () => {
    // Given an author and an observer that also projects the author's age
    await insertAuthor({ first_name: "Author", age: 30 });
    const em = newEntityManager();
    const observer = new AuthorAgeObserver();
    em.addPlugin(observer);
    // When application code requests only the name
    const a = table(Author);
    await em.query({ from: a, select: { name: a.firstName } });
    // Then the result hook can read the query-level auxiliary projection
    expect(observer.results).toEqual([[{ name: "Author", _age: 30 }]]);
  });

  it("does not treat mutation returning rows as query results", async () => {
    // Given an author and a read-result observer
    await insertAuthor({ first_name: "Author" });
    const em = newEntityManager();
    const observer = new ReadObserver();
    em.addPlugin(observer);
    // When a delete returns the removed author's name
    const a = table(Author);
    await em.execute({ delete: a, where: a.id.eq("a:1"), returning: { name: a.firstName } });
    // Then read-result hooks do not receive mutation results
    expect(observer.results).toEqual([]);
  });

  it("renders structured NOT EXISTS policies with bound subquery predicates", async () => {
    // Given two authors, one with a restricted book
    await insertAuthor({ first_name: "Allowed" });
    await insertAuthor({ first_name: "Restricted" });
    await insertBook({ title: "Restricted", author_id: 2 });
    // And a policy that excludes authors with restricted books
    const em = newEntityManager();
    em.addPlugin(new NoRestrictedBooks());
    // When a query also has its own bound filter
    const a = table(Author);
    const rows = await em.query({ from: a, select: { name: a.firstName }, where: a.firstName.ne("Excluded") });
    // Then the compiler applies the correlated policy with bindings in SQL order
    expect(rows).toEqual([{ name: "Allowed" }]);
  });

  it("calls beforeQuery once with the complete CTE and subquery tree", async () => {
    // Given a book and a plugin that records all physical reads at the statement boundary
    await insertAuthor({ first_name: "Author" });
    await insertBook({ title: "Book", author_id: 1 });
    const em = newEntityManager();
    const observer = new QueryTreeObserver();
    em.addPlugin(observer);
    // When a CTE and a scalar expression each read authors
    const a = table(Author);
    const b = table(Book);
    const names = query({ from: a, select: { name: a.firstName }, as: "names" });
    const count = query({ from: a, select: a.id.count() });
    await em.query({
      with: [names],
      from: b,
      select: { title: b.title, count },
      where: { exists: query({ from: names, select: names.name }) },
    });
    // Then one hook invocation can visit every SELECT in the statement
    expect(observer.tablesByCall).toEqual([["books", "authors", "authors"]]);
  });

  it("rewrites scalar subqueries inside projected expressions before rendering", async () => {
    // Given an adult and a child
    await insertAuthor({ first_name: "Adult", age: 30 });
    await insertAuthor({ first_name: "Child", age: 12 });
    // And a book that supplies the outer query's single row
    await insertBook({ title: "Book", author_id: 1 });
    const em = newEntityManager();
    em.addPlugin(new AdultAuthors());
    // When a projected expression wraps an author-count subquery
    const a = table(Author);
    const b = table(Book);
    const count = query({ from: a, select: a.id.count() });
    const rows = await em.query({ from: b, select: { count: count.coalesce(0) } });
    // Then the nested count reflects the policy added by the outer hook
    expect(rows).toEqual([{ count: 1 }]);
  });

  it("rewrites both union operands through one query-tree visitor", async () => {
    // Given an adult and a child under an adult-only policy
    await insertAuthor({ first_name: "Adult", age: 30 });
    await insertAuthor({ first_name: "Child", age: 12 });
    const em = newEntityManager();
    em.addPlugin(new AdultAuthors());
    // When a derived table wraps the union of two author reads
    const a = table(Author);
    const names = query({
      union: [
        { from: a, select: { name: a.firstName } },
        { from: a, select: { name: a.firstName } },
      ],
    });
    const rows = await em.query({ from: names, select: names });
    // Then neither operand exposes the child
    expect(rows).toEqual([{ name: "Adult" }]);
  });

  it("does not retain an unused join because a visitor added its policy", async () => {
    // Given a book whose author does not satisfy the adult-only policy
    await insertAuthor({ first_name: "Child", age: 12 });
    await insertBook({ title: "Book", author_id: 1 });
    const em = newEntityManager();
    em.addPlugin(new AdultAuthors());
    // When an unused inner join receives its policy before pruning
    const a = table(Author);
    const b = table(Book);
    const rows = await em.query({
      from: b,
      join: [{ inner: a, on: b.authorId.eq(a.id) }],
      select: { title: b.title },
    });
    // Then the unused join is still removed rather than filtering out the book
    expect(rows).toEqual([{ title: "Book" }]);
  });

  it("visits recursive CTE definitions without following self-references", async () => {
    // Given an adult mentor and a child mentee
    await insertAuthor({ first_name: "Adult", age: 30 });
    await insertAuthor({ first_name: "Child", age: 12, mentor_id: 1 });
    const em = newEntityManager();
    em.addPlugin(new AdultAuthors());
    // When the policy visits a recursive mentor tree
    const a = table(Author);
    const tree = recursiveQuery("tree", { from: a, where: a.mentorId.eq(null), select: { id: a.id } }, (self) => ({
      from: a,
      join: [{ inner: self, on: a.mentorId.eq(self.id) }],
      select: { id: a.id },
    }));
    const rows = await em.query({ with: tree, from: tree, select: tree });
    // Then the recursive term applies the policy without visiting the CTE forever
    expect(rows).toEqual([{ id: "a:1" }]);
  });

  it("lets beforeExecute rewrite reads inside mutation assignments", async () => {
    // Given a child ordered before an adult
    await insertAuthor({ first_name: "Child", age: 12 });
    await insertAuthor({ first_name: "Adult", age: 30 });
    // And a book to rename using the first authorized author
    await insertBook({ title: "Book", author_id: 1 });
    const em = newEntityManager();
    em.addPlugin(new MutationReadPolicy());
    // When an update uses an author subquery in its assignment
    const a = table(Author);
    const b = table(Book);
    await em.execute({
      update: b,
      set: { title: query({ from: a, select: a.firstName, orderBy: a.id.asc(), limit: 1 }).coalesce("No author") },
      where: b.id.eq("b:1"),
    });
    // Then the mutation's hook authorized the nested read before the title was written
    expect((await newEntityManager().load(Book, "b:1")).title).toEqual("Adult");
  });

  it("calls beforeExecute once for an INSERT SELECT and its CTE", async () => {
    // Given a tag and a plugin recording mutation reads
    await insertTag({ name: "Tag" });
    const em = newEntityManager();
    const observer = new QueryTreeObserver();
    em.addPlugin(observer);
    // When a CTE supplies names for new tags
    const t = table(Tag);
    const source = query({ from: t, select: { name: t.name }, as: "source" });
    await em.execute({ with: [source], insert: t, from: query({ from: source, select: source }) });
    // Then the mutation hook sees its whole read tree without separate beforeQuery callbacks
    expect(observer.tablesByCall).toEqual([["insert", "tags"]]);
  });

  it("retains a join referenced by a projection added before pruning", async () => {
    // Given a book whose author's age is not requested by application code
    await insertAuthor({ first_name: "Author", age: 30 });
    await insertBook({ title: "Book", author_id: 1 });
    // And a plugin that selects the joined author's age
    const em = newEntityManager();
    const observer = new JoinedAuthorAgeObserver();
    em.addPlugin(observer);
    // When the original projection leaves the author join unused
    const a = table(Author);
    const b = table(Book);
    await em.query({
      from: b,
      join: [{ left: a, on: b.authorId.eq(a.id) }],
      select: { title: b.title },
    });
    // Then pruning sees the plugin's projection and keeps the join
    expect(observer.results).toEqual([[{ title: "Book", _age: 30 }]]);
  });

  it("lets beforeExecute reject an empty insert before the no-op shortcut", async () => {
    // Given a plugin that rejects immediate writes
    const em = newEntityManager();
    em.addPlugin(new EntityWritesOnly());
    // When execute receives an empty import
    const result = em.execute({ insert: table(Tag), values: [] });
    // Then the mutation still follows the statement hook lifecycle
    await expect(result).rejects.toThrow("Use entity writes");
  });

  it("authorizes subqueries in both INSERT values and RETURNING", async () => {
    // Given a child ordered before an adult
    await insertAuthor({ first_name: "Child", age: 12 });
    await insertAuthor({ first_name: "Adult", age: 30 });
    // And a mutation policy that allows reads of adults only
    const em = newEntityManager();
    em.addPlugin(new MutationReadPolicy());
    // When a tag's name and returned author count both come from subqueries
    const a = table(Author);
    const t = table(Tag);
    const name = query({ from: a, select: a.firstName, orderBy: a.id.asc(), limit: 1 }).coalesce("No author");
    const result = await em.execute({
      insert: t,
      values: [{ name }],
      returning: { name: t.name, count: query({ from: a, select: a.id.count() }) },
    });
    // Then both expressions use the same adult-only policy
    expect(result.rows).toEqual([{ name: "Adult", count: 1 }]);
  });

  it("authorizes subqueries in mutation predicates", async () => {
    // Given books by an adult and a child
    await insertAuthor({ first_name: "Adult", age: 30 });
    await insertAuthor({ first_name: "Child", age: 12 });
    await insertBook({ title: "Adult's book", author_id: 1 });
    await insertBook({ title: "Child's book", author_id: 2 });
    // And a mutation policy that allows reads of adults only
    const em = newEntityManager();
    em.addPlugin(new MutationReadPolicy());
    // When an update selects books through an author subquery
    const a = table(Author);
    const b = table(Book);
    await em.execute({
      update: b,
      set: { title: "Updated" },
      where: b.authorId.in(query({ from: a, select: a.id })),
    });
    // Then only the adult's book was updated
    expect(await newEntityManager().query({ from: b, select: b.title, orderBy: b.id.asc() })).toEqual([
      "Updated",
      "Child's book",
    ]);
  });
});

/** An example per-table policy shared by root and nested SQL reads. */
class AdultAuthors extends Plugin {
  beforeQuery(query: ParsedReadQuery): void {
    visitQuery(query, restrictToAdults);
  }
}

/** Immediate writes can be denied independently of SELECT rewriting. */
class EntityWritesOnly extends Plugin {
  beforeExecute(): void {
    throw new Error("Use entity writes");
  }
}

/** Records driver rows without requiring a query-rewriting hook. */
class ReadObserver extends Plugin {
  results: unknown[][] = [];

  afterQuery(_read: ParsedReadQuery, rows: RowData): void {
    this.results.push(rows.toRows());
  }
}

/** Projects auxiliary fields even when application code requests a plain object. */
class AuthorAgeObserver extends ReadObserver {
  beforeQuery(read: ParsedReadQuery): void {
    if (read.kind !== "select") return;
    const author = read.tables.find((table) => table.join === "primary" && table.table === "authors");
    if (author) read.selects.push({ sql: `"${author.alias}".age AS _age`, bindings: [], refs: [author.alias] });
  }
}

/** Uses a result hook to cache projected visibility before public entity access. */
class AdultVisibility extends Plugin {
  private visible = new Set<string>();

  beforeQuery(read: ParsedReadQuery): void {
    if (read.kind !== "select") return;
    if (read.entityMetadata?.type !== "Author") return;
    const author = read.tables.find((table) => table.join === "primary")!;
    read.selects.push({ sql: `"${author.alias}".age >= ? AS _adult`, bindings: [18], refs: [author.alias] });
  }

  afterQuery(read: ParsedReadQuery, rows: RowData): void {
    if (read.kind !== "select" || !read.entityMetadata) return;
    for (let i = 0; i < rows.rowCount; i++) {
      if (rows.get(i, "_adult")) this.visible.add(tagId(read.entityMetadata, rows.get(i, "id")));
    }
  }

  canViewEntity(entity: Entity): boolean {
    return this.visible.has(entity.idTagged);
  }
}

/** Excludes authors whose books match a structured policy subquery. */
class NoRestrictedBooks extends Plugin {
  /**
   * Adds a correlated book policy without rendering the condition tree in the plugin.
   *
   * The subquery's title binding follows any bindings in the application's outer WHERE.
   */
  beforeQuery(read: ParsedReadQuery): void {
    if (read.kind !== "select") return;
    for (const table of read.tables) {
      if (table.table !== "authors") continue;
      const alias = `${table.alias}_restricted_books`;
      table.conditions.push({
        kind: "exists",
        negate: true,
        outerAliases: [table.alias],
        subquery: {
          selects: ["1"],
          tables: [{ join: "primary", table: "books", alias }],
          orderBys: [],

          // Restrict the policy to this author's books with the protected title.
          condition: {
            kind: "exp",
            op: "and",
            conditions: [
              {
                kind: "raw",
                condition: `"${alias}".author_id = "${table.alias}".id`,
                aliases: [alias, table.alias],
                bindings: [],
                pruneable: false,
              },
              {
                kind: "column",
                alias,
                column: "title",
                dbType: "text",
                cond: { kind: "eq", value: "Restricted" },
              },
            ],
          },
        },
      });
    }
  }
}

/** Records SELECT tables at each statement hook, making duplicate hook calls observable. */
class QueryTreeObserver extends Plugin {
  tablesByCall: string[][] = [];

  beforeQuery(query: ParsedReadQuery): void {
    const tables: string[] = [];
    visitQuery(query, (select) => tables.push(...select.tables.map((table) => table.table)));
    this.tablesByCall.push(tables);
  }

  beforeExecute(query: ParsedExecuteQuery): void {
    const tables: string[] = [query.kind];
    visitQuery(query, (select) => tables.push(...select.tables.map((table) => table.table)));
    this.tablesByCall.push(tables);
  }
}

/** A mutation owns authorization of its nested reads; it must not trigger a separate read hook. */
class MutationReadPolicy extends Plugin {
  beforeQuery(): void {
    throw new Error("Mutation reads belong to beforeExecute");
  }

  beforeExecute(query: ParsedExecuteQuery): void {
    visitQuery(query, restrictToAdults);
  }
}

/** Adds an auxiliary projection that requires a join the application did not otherwise use. */
class JoinedAuthorAgeObserver extends ReadObserver {
  beforeQuery(query: ParsedReadQuery): void {
    visitQuery(query, (select) => {
      const author = select.tables.find((table) => table.table === "authors");
      if (author) select.selects.push({ sql: `"${author.alias}".age AS _age`, bindings: [], refs: [author.alias] });
    });
  }
}

/** Adds an adult-only policy to physical author tables in this SELECT. */
function restrictToAdults(read: ParsedSelectQuery): void {
  for (const table of read.tables) {
    if (table.table === "authors") {
      table.conditions.push({
        kind: "column",
        alias: table.alias,
        column: "age",
        dbType: "int",
        cond: { kind: "gte", value: 18 },
      });
    }
  }
}
