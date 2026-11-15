import {
  type Entity,
  type ParsedExecuteQuery,
  type ParsedExpressionCondition,
  type ParsedReadQuery,
  type ParsedSelectQuery,
  type ParsedSql,
  type ParsedTableSource,
  Plugin,
  type RowData,
  columnSql,
  joinSql,
  query,
  recursiveQuery,
  sql,
  table,
  tables,
  tagId,
  visitQuery,
  visitQueryExpressions,
  visitSql,
} from "joist-orm";
import { Author, Book, Tag } from "src/entities";
import { insertAuthor, insertBook, insertTag, select } from "src/entities/inserts";
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
    const [a, b] = tables(Author, Book);
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
    const names = query({ from: a, select: [a.firstName], orderBy: a.firstName.asc() });
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

  it("lets beforeExecute reject an empty insert before the no-op shortcut", async () => {
    // Given a plugin that rejects immediate writes
    const em = newEntityManager();
    em.addPlugin(new EntityWritesOnly());
    // When execute receives an empty import
    const result = em.execute({ insert: table(Tag), values: [] });
    // Then the mutation still follows the statement hook lifecycle
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
    // Uses a result hook to cache projected visibility before public entity access.
    em.addPlugin(
      new (class extends Plugin {
        private visible = new Set<string>();

        beforeQuery(read: ParsedReadQuery): void {
          if (read.kind !== "select") return;
          if (read.entityMetadata?.type !== "Author") return;
          const author = read.from;
          read.selects.push(joinSql([columnSql(author.alias, "age"), " >= ", { value: 18 }, " AS _adult"]));
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
      })(),
    );
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
    // Projects auxiliary fields even when application code requests a plain object.
    const observer = new (class extends ReadObserver {
      beforeQuery(read: ParsedReadQuery): void {
        if (read.kind !== "select") return;
        const author = read.from.kind === "table" && read.from.table === "authors" ? read.from : undefined;
        if (author) read.selects.push(joinSql([columnSql(author.alias, "age"), " AS _age"]));
      }
    })();
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
    // Excludes authors whose books match a structured policy subquery.
    em.addPlugin(
      new (class extends Plugin {
        /**
         * Adds a correlated book policy without rendering the condition tree in the plugin.
         *
         * The subquery's title binding follows any bindings in the application's outer WHERE.
         */
        beforeQuery(read: ParsedReadQuery): void {
          if (read.kind !== "select") return;
          for (const table of tableSources(read)) {
            if (table.table !== "authors") continue;
            const alias = `${table.alias}_restricted_books`;
            addTableCondition(read, table, {
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
      })(),
    );
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
    const [a, b] = tables(Author, Book);
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
    const [a, b] = tables(Author, Book);
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
    const [a, b] = tables(Author, Book);
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
    em.addPlugin(new AdultAuthorsInMutations());
    // When an update uses an author subquery in its assignment
    const [a, b] = tables(Author, Book);
    await em.execute({
      update: b,
      set: { title: query({ from: a, select: a.firstName, orderBy: a.id.asc(), limit: 1 }).coalesce("No author") },
      where: b.id.eq("b:1"),
    });
    // Then the mutation's hook authorized the nested read before the title was written
    expect(await select("books")).toMatchObject([{ title: "Adult" }]);
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
    // Adds an auxiliary projection that requires a join the application did not otherwise use.
    const observer = new (class extends ReadObserver {
      beforeQuery(query: ParsedReadQuery): void {
        visitQuery(query, (select) => {
          const author = tableSources(select).find((table) => table.table === "authors");
          if (author) select.selects.push(joinSql([columnSql(author.alias, "age"), " AS _age"]));
        });
      }
    })();
    em.addPlugin(observer);
    // When the original projection leaves the author join unused
    const [a, b] = tables(Author, Book);
    await em.query({
      from: b,
      join: [{ left: a, on: b.authorId.eq(a.id) }],
      select: { title: b.title },
    });
    // Then pruning sees the plugin's projection and keeps the join
    expect(observer.results).toEqual([[{ title: "Book", _age: 30 }]]);
  });

  it("authorizes subqueries in both INSERT values and RETURNING", async () => {
    // Given a child ordered before an adult
    await insertAuthor({ first_name: "Child", age: 12 });
    await insertAuthor({ first_name: "Adult", age: 30 });
    // And a mutation policy that allows reads of adults only
    const em = newEntityManager();
    em.addPlugin(new AdultAuthorsInMutations());
    // When a tag's name and returned author count both come from subqueries
    const [a, t] = tables(Author, Tag);
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
    em.addPlugin(new AdultAuthorsInMutations());
    // When an update selects books through an author subquery
    const [a, b] = tables(Author, Book);
    await em.execute({
      update: b,
      set: { title: "Updated" },
      where: b.authorId.in(query({ from: a, select: a.id })),
    });
    // Then only the adult's book was updated
    expect(await select("books")).toMatchObject([{ title: "Updated" }, { title: "Child's book" }]);
  });
  it("retains an unused join referenced by a plugin-added WHERE predicate", async () => {
    // Given two authors, only one with a selected book
    await insertAuthor({ first_name: "Selected" });
    await insertAuthor({ first_name: "Other" });
    await insertBook({ title: "Selected book", author_id: 1 });
    // And a plugin that filters by the joined book's title
    const em = newEntityManager();
    em.addPlugin(
      new (class extends Plugin {
        beforeQuery(read: ParsedReadQuery): void {
          if (read.kind !== "select") return;
          read.where = {
            kind: "condition",
            topLevel: true,
            condition: {
              kind: "exp",
              op: "and",
              conditions: [
                {
                  kind: "column",
                  alias: read.joins[0].source.alias,
                  column: "title",
                  dbType: "text",
                  cond: { kind: "eq", value: "Selected book" },
                },
              ],
            },
          };
        }
      })(),
    );
    // When the application only selects author names
    const [a, b] = tables(Author, Book);
    const rows = await em.query({
      from: a,
      join: [{ left: b, on: a.id.eq(b.authorId) }],
      select: a.firstName,
    });
    // Then the plugin's WHERE retains the book join and filters out the other author
    expect(rows).toEqual(["Selected"]);
  });

  it("retains dependencies introduced by a rewritten ON predicate", async () => {
    // Given an author with one book
    await insertAuthor({ first_name: "Author" });
    await insertBook({ title: "Book", author_id: 1 });
    // And a plugin that makes the selected book join depend on an earlier book join
    const em = newEntityManager();
    em.addPlugin(
      new (class extends Plugin {
        beforeQuery(read: ParsedReadQuery): void {
          if (read.kind !== "select") return;
          const first = read.joins[0].source.alias;
          const second = read.joins[1].source.alias;
          read.joins[1].on = joinSql([columnSql(second, "id"), " = ", columnSql(first, "id")]);
        }
      })(),
    );
    // When the application only selects the second join
    const [a, first, second] = tables(Author, Book, Book);
    const rows = await em.query({
      from: a,
      join: [
        { left: first, on: a.id.eq(first.authorId) },
        { left: second, on: a.id.eq(second.authorId) },
      ],
      select: second.title,
    });
    // Then the rewritten ON retains the earlier join needed to find the book
    expect(rows).toEqual(["Book"]);
  });

  it("validates forward references introduced by a plugin's ON predicate", async () => {
    // Given a plugin that makes the first book join depend on the later book join
    const em = newEntityManager();
    em.addPlugin(
      new (class extends Plugin {
        beforeQuery(read: ParsedReadQuery): void {
          if (read.kind !== "select") return;
          const first = read.joins[0].source.alias;
          const second = read.joins[1].source.alias;
          read.joins[0].on = joinSql([columnSql(first, "id"), " = ", columnSql(second, "id")]);
        }
      })(),
    );
    // When the application selects the first join
    const [a, first, second] = tables(Author, Book, Book);
    const result = em.query({
      from: a,
      join: [
        { left: first, on: a.id.eq(first.authorId) },
        { left: second, on: a.id.eq(second.authorId) },
      ],
      select: first.title,
    });
    // Then the rewritten ON is rejected before PostgreSQL sees an invalid forward reference
    await expect(result).rejects.toThrow("which is joined later; move that join earlier in the join array");
  });

  it("accepts a plugin-supplied ON after the caller's optional predicate disappears", async () => {
    // Given an author and a book
    await insertAuthor({ first_name: "Author" });
    await insertBook({ title: "Book", author_id: 1 });
    // And a plugin that supplies the join condition
    const em = newEntityManager();
    em.addPlugin(
      new (class extends Plugin {
        beforeQuery(read: ParsedReadQuery): void {
          if (read.kind !== "select") return;
          const author = read.from.alias;
          const book = read.joins[0].source.alias;
          read.joins[0].on = joinSql([columnSql(book, "author_id"), " = ", columnSql(author, "id")]);
        }
      })(),
    );
    // When the caller's ON has no surviving optional conditions
    const [a, b] = tables(Author, Book);
    const rows = await em.query({
      from: a,
      join: [{ left: b, on: b.title.eq(undefined) }],
      select: b.title,
    });
    // Then validation uses the plugin's ON and returns the joined book
    expect(rows).toEqual(["Book"]);
  });
  it("rewrites column references in projections, predicates, and ordering", async () => {
    // Given authors whose last names match a filter their first names do not
    await insertAuthor({ first_name: "First", last_name: "Target B" });
    await insertAuthor({ first_name: "Second", last_name: "Target A" });
    // And a plugin that substitutes last name for first name throughout the SELECT
    const em = newEntityManager();
    em.addPlugin(
      new (class extends Plugin {
        beforeQuery(query: ParsedReadQuery): void {
          visitQuery(query, (read) => {
            for (const expression of [...read.selects, read.where, ...read.orderBys]) {
              if (!expression) continue;
              visitSql(expression, (node) => {
                if (node.kind === "column" && node.column === "first_name") node.column = "last_name";
              });
            }
          });
        }
      })(),
    );
    // When the caller projects, filters, and sorts by first name
    const a = table(Author);
    const rows = await em.query({
      from: a,
      select: { name: a.firstName.coalesce("Fallback") },
      where: a.firstName.like("Target%"),
      orderBy: a.firstName.asc(),
    });
    // Then every expression uses the rewritten column
    expect(rows).toEqual([{ name: "Target A" }, { name: "Target B" }]);
  });
  it("retains an enclosing join referenced by a rewritten subquery", async () => {
    // Given books by an adult and a child, and one tag to count
    await insertAuthor({ first_name: "Adult", age: 30 });
    await insertAuthor({ first_name: "Child", age: 12 });
    await insertBook({ title: "Adult's book", author_id: 1 });
    await insertBook({ title: "Child's book", author_id: 2 });
    await insertTag({ name: "Tag" });
    // And a plugin that correlates the tag count with the joined author's age
    const em = newEntityManager();
    em.addPlugin(
      new (class extends Plugin {
        beforeQuery(root: ParsedReadQuery): void {
          if (root.kind !== "select") return;
          const author = root.joins[0].source.alias;
          visitQuery(root, (read) => {
            if (read !== root) read.where = joinSql([columnSql(author, "age"), " >= ", { value: 18 }]);
          });
        }
      })(),
    );
    // When the original statement leaves the author join unused
    const [a, b, t] = tables(Author, Book, Tag);
    const rows = await em.query({
      from: b,
      join: [{ left: a, on: b.authorId.eq(a.id) }],
      select: { title: b.title, count: query({ from: t, select: t.id.count() }) },
      orderBy: b.id.asc(),
    });
    // Then pruning retains the author required by the rewritten count
    expect(rows).toEqual([
      { title: "Adult's book", count: 1 },
      { title: "Child's book", count: 0 },
    ]);
  });

  it("prunes an enclosing join after a plugin removes its subquery reference", async () => {
    // Given one author with two books and one tag
    await insertAuthor({ first_name: "Author" });
    await insertBook({ title: "First", author_id: 1 });
    await insertBook({ title: "Second", author_id: 1 });
    await insertTag({ name: "First" });
    // And a plugin that removes the tag count's correlation to books
    const em = newEntityManager();
    em.addPlugin(
      new (class extends Plugin {
        beforeQuery(root: ParsedReadQuery): void {
          visitQuery(root, (read) => {
            if (read !== root) read.where = undefined;
          });
        }
      })(),
    );
    // When books are referenced only inside the count predicate
    const [a, b, t] = tables(Author, Book, Tag);
    const rows = await em.query({
      from: a,
      join: [{ left: b, on: a.id.eq(b.authorId) }],
      select: { author: a.firstName, count: query({ from: t, select: t.id.count(), where: t.name.eq(b.title) }) },
    });
    // Then the unused book join prunes instead of duplicating the author
    expect(rows).toEqual([{ author: "Author", count: 1 }]);
  });

  it("retains a CTE read by another CTE without any column references", async () => {
    // Given a tag selected by the first CTE
    await insertTag({ name: "Tag" });
    const em = newEntityManager();
    const t = table(Tag);
    const names = query({ from: t, select: { name: t.name }, as: "names" });
    // When a second CTE counts those rows without naming any of their columns
    const counts = query({ from: names, select: { count: sql<number>`count(*)::int` }, as: "counts" });
    const rows = await em.query({ with: [names, counts], from: counts, select: counts });
    // Then the FROM dependency retains the first CTE
    expect(rows).toEqual([{ count: 1 }]);
  });
  it("renders a physical source rewritten by a plugin", async () => {
    // Given an author and a tag with distinct names
    await insertAuthor({ first_name: "Author" });
    await insertTag({ name: "Tag" });
    // And a plugin redirects the author projection to tags
    const em = newEntityManager();
    em.addPlugin(
      new (class extends Plugin {
        beforeQuery(read: ParsedReadQuery): void {
          if (read.kind !== "select" || read.from.kind !== "table") return;
          read.from.table = "tags";
          read.from.meta = undefined;
          read.where = undefined;
          read.selects = [joinSql([columnSql(read.from.alias, "name"), " AS name"])];
        }
      })(),
    );
    // When application code selects an author's name
    const a = table(Author);
    const rows = await em.query({ from: a, select: { name: a.firstName } });
    // Then the rewritten source supplies the tag's name
    expect(rows).toEqual([{ name: "Tag" }]);
  });
  it("resolves correlated expression sources in the nested SELECT's clause", async () => {
    // Given an author with a book named after their last name
    await insertAuthor({ first_name: "First", last_name: "Last" });
    await insertBook({ title: "Last", author_id: 1 });
    // And a plugin replaces author first-name predicates, leaving projections unchanged
    const em = newEntityManager();
    em.addPlugin(
      new (class extends Plugin {
        beforeQuery(read: ParsedReadQuery): void {
          visitQueryExpressions(read, (node, context) => {
            if (node.kind !== "column" || node.column !== "first_name" || context.clause !== "where") return;
            const source = context.resolveSource(node.alias);
            if (source?.kind === "table" && source.table === "authors") node.column = "last_name";
          });
        }
      })(),
    );
    // When a projected subquery counts books matching the author's first name
    const [a, b] = tables(Author, Book);
    const rows = await em.query({
      from: a,
      select: {
        name: a.firstName,
        count: query({ from: b, select: b.id.count(), where: b.title.eq(a.firstName) }),
      },
    });
    // Then the nested predicate uses the enclosing author's last name without changing the projection
    expect(rows).toEqual([{ name: "First", count: 1 }]);
  });
  it("retains an enclosing CTE read through a nested CTE without column references", async () => {
    // Given a tag exposed by an enclosing CTE
    await insertTag({ name: "Tag" });
    const em = newEntityManager();
    const t = table(Tag);
    const names = query({ from: t, select: { name: t.name }, as: "names" });
    // And a nested CTE counts its rows without reading a column
    const counts = query({ from: names, select: { count: sql<number>`count(*)::int` }, as: "counts" });
    const nested = query({ with: [counts], from: counts, select: counts, as: "nested" });
    // When only the nested result is selected
    const rows = await em.query({ with: [names], from: nested, select: nested });
    // Then pruning retains the enclosing definition needed by the nested CTE
    expect(rows).toEqual([{ count: 1 }]);
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

/** Records SELECT tables at each statement hook, making duplicate hook calls observable. */
class QueryTreeObserver extends Plugin {
  tablesByCall: string[][] = [];

  beforeQuery(query: ParsedReadQuery): void {
    const tables: string[] = [];
    visitQuery(query, (select) => tables.push(...tableSources(select).map((table) => table.table)));
    this.tablesByCall.push(tables);
  }

  beforeExecute(query: ParsedExecuteQuery): void {
    const tables: string[] = [query.kind];
    visitQuery(query, (select) => tables.push(...tableSources(select).map((table) => table.table)));
    this.tablesByCall.push(tables);
  }
}

/** Restricts nested author reads to adults through beforeExecute; a separate read hook is an error. */
class AdultAuthorsInMutations extends Plugin {
  beforeQuery(): void {
    throw new Error("Mutation reads belong to beforeExecute");
  }

  beforeExecute(query: ParsedExecuteQuery): void {
    visitQuery(query, restrictToAdults);
  }
}

/** Adds an adult-only policy to physical author tables in this SELECT. */
function restrictToAdults(read: ParsedSelectQuery): void {
  for (const table of tableSources(read)) {
    if (table.table === "authors") {
      addTableCondition(read, table, {
        kind: "column",
        alias: table.alias,
        column: "age",
        dbType: "int",
        cond: { kind: "gte", value: 18 },
      });
    }
  }
}

/** Applies the test plugin's filter at the table's WHERE or ON location. */
function addTableCondition(
  read: ParsedSelectQuery,
  table: ParsedTableSource,
  condition: ParsedExpressionCondition,
): void {
  const predicate: ParsedSql = {
    kind: "condition",
    condition: { kind: "exp", op: "and", conditions: [condition] },
    topLevel: true,
  };
  if (table === read.from) {
    read.where = read.where ? joinSql(["(", read.where, ") AND (", predicate, ")"]) : predicate;
  } else {
    const join = read.joins.find((join) => join.source === table)!;
    if (join.on) join.on = joinSql(["(", join.on, ") AND (", predicate, ")"]);
  }
}

/** Finds physical tables in the current statement sources. */
function tableSources(read: ParsedSelectQuery): ParsedTableSource[] {
  return [read.from, ...read.joins.map((join) => join.source)].filter((source) => source.kind === "table");
}
