import { type ParsedFindQuery, Plugin, aliases } from "joist-orm";
import { Author, Book, Tag } from "src/entities";
import { insertAuthor, insertAuthorToTag, insertBook, insertBookToTag, insertTag } from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("find.m2m-ids", () => {
  it("keeps the target join when another target column is filtered", async () => {
    // Given a tagged author
    await insertAuthor({ first_name: "one" });
    await insertTag({ name: "one" });
    await insertAuthorToTag({ author_id: 1, tag_id: 1 });
    // When both the target id and name must match
    const result = await newEntityManager().find(Author, { tags: { id: "t:1", name: "one" } });
    // Then the target name still requires the target table
    expect(result.map((a) => a.firstName)).toEqual(["one"]);
    expect(queries.at(-1)).toMatchInlineSnapshot(
      `"SELECT a.* FROM authors AS a WHERE a.deleted_at IS NULL AND EXISTS (SELECT 1 FROM authors_to_tags AS att LEFT OUTER JOIN tags AS t ON att.tag_id = t.id WHERE a.id = att.author_id AND t.id = $1 AND t.name = $2) ORDER BY a.id ASC LIMIT $3"`,
    );
  });

  it.each(["exclude", "include"] as const)("respects softDeletes %s on m2m targets", async (softDeletes) => {
    // Given a tag attached only to a soft-deleted book
    await insertAuthor({ first_name: "one" });
    await insertBook({ title: "deleted", author_id: 1, deleted_at: new Date() });
    await insertTag({ name: "one" });
    await insertBookToTag({ book_id: 1, tag_id: 1 });
    // When finding the tag through the deleted book's id
    const [b] = aliases(Book);
    const result = await newEntityManager().find(
      Tag,
      { books: { as: b } },
      { softDeletes, conditions: { and: [b.id.eq("b:1")] } },
    );
    // Then excluding deleted targets retains their table and the exclusion condition
    expect(result.map((t) => t.name)).toEqual(softDeletes === "exclude" ? [] : ["one"]);
    if (softDeletes === "exclude") {
      expect(queries.at(-1)).toMatchInlineSnapshot(
        `"SELECT t.* FROM tags AS t WHERE EXISTS (SELECT 1 FROM books_to_tags AS btt LEFT OUTER JOIN books AS b ON btt.book_id = b.id WHERE t.id = btt.tag_id AND b.deleted_at IS NULL AND b.id = $1) ORDER BY t.id ASC LIMIT $2"`,
      );
    } else {
      expect(queries.at(-1)).toMatchInlineSnapshot(
        `"SELECT t.* FROM tags AS t WHERE EXISTS (SELECT 1 FROM books_to_tags AS btt WHERE t.id = btt.tag_id AND btt.book_id = $1) ORDER BY t.id ASC LIMIT $2"`,
      );
    }
  });

  it("keeps plugin-replaced target tables", async () => {
    // Given a tagged author and a plugin substituting an empty target relation
    await insertAuthor({ first_name: "one" });
    await insertTag({ name: "one" });
    await insertAuthorToTag({ author_id: 1, tag_id: 1 });
    class EmptyTags extends Plugin {
      /** Models a versioning plugin whose selected target rows differ from the physical table. */
      beforeFind(_meta: unknown, _operation: unknown, query: ParsedFindQuery): void {
        for (const table of query.tables) if (table.table === "tags") table.table = "books";
      }
    }
    const em = newEntityManager();
    em.addPlugin(new EmptyTags());

    // When the requested id exists physically but not in the plugin's selected version
    const [t] = aliases(Tag);
    const result = await em.find(Author, { tags: t }, { conditions: { and: [t.id.eq("t:1")] } });

    // Then FK substitution cannot bypass the plugin's relation
    expect(result).toEqual([]);
  });

  it("batches concurrent id-only filters using the m2m table FK", async () => {
    // Given authors with distinct tags
    await insertAuthor({ first_name: "one" });
    await insertAuthor({ first_name: "two" });
    await insertTag({ name: "one" });
    await insertTag({ name: "two" });
    await insertAuthorToTag({ author_id: 1, tag_id: 1 });
    await insertAuthorToTag({ author_id: 2, tag_id: 2 });
    const em = newEntityManager();
    resetQueryCount();

    // When target ids vary across concurrent callers
    const [t] = aliases(Tag);
    const result = await Promise.all(
      ["t:1", "t:2"].map((id) =>
        em.find(Author, { tags: t, firstName: { ne: "none" } }, { conditions: { and: [t.id.eq(id)] } }),
      ),
    );

    // Then each caller gets its own membership without a target lookup
    expect(result.map((rows) => rows.map((a) => a.firstName))).toEqual([["one"], ["two"]]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0) AS (SELECT unnest($1::int[]), unnest($2::int[])) SELECT array_agg(_find.tag) as _tags, a.* FROM authors AS a CROSS JOIN _find AS _find WHERE a.deleted_at IS NULL AND a.first_name != $3 AND EXISTS (SELECT 1 FROM authors_to_tags AS att WHERE a.id = att.author_id AND att.tag_id = _find.arg0) GROUP BY a.id ORDER BY a.id ASC LIMIT $4",
     ]
    `);
  });

  it.each(["select", "order"])("retains targets used by a plugin %s", async (usage) => {
    // Given an author with one tag
    await insertAuthor({ first_name: "one" });
    await insertTag({ name: "one" });
    await insertAuthorToTag({ author_id: 1, tag_id: 1 });
    // And a plugin that reads the target name outside the filter
    class ReadTag extends Plugin {
      /** Adds a target usage that must survive FK pruning. */
      beforeFind(_meta: unknown, _operation: unknown, query: ParsedFindQuery): void {
        const target = query.tables.find((t) => t.table === "tags")!;
        if (usage === "select") query.selects.push(`${target.alias}.name AS tag_name`);
        else query.orderBys.unshift({ alias: target.alias, column: "name", order: "ASC" });
      }
    }
    const em = newEntityManager();
    em.addPlugin(new ReadTag());
    const [t] = aliases(Tag);

    // When the filter itself only reads the target id
    const result = await em.find(Author, { tags: t }, { conditions: { and: [t.id.eq("t:1")] } });

    // Then the extra target usage retains its join
    expect(result.map((a) => a.firstName)).toEqual(["one"]);
    if (usage === "select") {
      expect(queries.at(-1)).toMatchInlineSnapshot(
        `"SELECT DISTINCT ON (a.id, a.id) a.*, t.name AS tag_name, a.id FROM authors AS a LEFT OUTER JOIN authors_to_tags AS att ON a.id = att.author_id LEFT OUTER JOIN tags AS t ON att.tag_id = t.id WHERE a.deleted_at IS NULL AND t.id = $1 ORDER BY a.id ASC LIMIT $2"`,
      );
    } else {
      expect(queries.at(-1)).toMatchInlineSnapshot(
        `"SELECT DISTINCT ON (t.name, a.id, a.id) a.*, t.name, a.id FROM authors AS a LEFT OUTER JOIN authors_to_tags AS att ON a.id = att.author_id LEFT OUTER JOIN tags AS t ON att.tag_id = t.id WHERE a.deleted_at IS NULL AND t.id = $1 ORDER BY t.name ASC, a.id ASC LIMIT $2"`,
      );
    }
  });

  it.each(["tags", "unrelated_tags"])("resolves target joins with a visible %s CTE", async (cteName) => {
    // Given a mentor whose mentee has a physical tag
    await insertAuthor({ first_name: "mentor" });
    await insertAuthor({ first_name: "mentee", mentor_id: 1 });
    await insertTag({ name: "one" });
    await insertAuthorToTag({ author_id: 2, tag_id: 1 });
    // And a plugin CTE that hides all tags only when its name shadows the target table
    class FilterTags extends Plugin {
      /** Models a filtered target relation visible to nested collection subqueries. */
      beforeFind(_meta: unknown, _operation: unknown, query: ParsedFindQuery): void {
        query.ctes = [
          { alias: cteName, query: { kind: "raw", sql: "SELECT * FROM public.tags WHERE false", bindings: [] } },
        ];
      }
    }
    const em = newEntityManager();
    em.addPlugin(new FilterTags());
    const [t] = aliases(Tag);

    // When the target id is read two EXISTS scopes below the CTE declaration
    const result = await em.find(Author, { mentees: { tags: t } }, { conditions: { and: [t.id.eq("t:1")] } });

    // Then only a shadowing CTE changes membership and requires the target join
    expect(result.map((a) => a.firstName)).toEqual(cteName === "tags" ? [] : ["mentor"]);
    if (cteName === "tags") {
      expect(queries.at(-1)).toMatchInlineSnapshot(
        `"WITH tags AS (SELECT * FROM public.tags WHERE false) SELECT a.* FROM authors AS a WHERE a.deleted_at IS NULL AND EXISTS (SELECT 1 FROM authors AS a1 WHERE a.id = a1.mentor_id AND a1.deleted_at IS NULL AND EXISTS (SELECT 1 FROM authors_to_tags AS att LEFT OUTER JOIN tags AS t ON att.tag_id = t.id WHERE a1.id = att.author_id AND t.id = $1)) ORDER BY a.id ASC LIMIT $2"`,
      );
    } else {
      expect(queries.at(-1)).toMatchInlineSnapshot(
        `"WITH unrelated_tags AS (SELECT * FROM public.tags WHERE false) SELECT a.* FROM authors AS a WHERE a.deleted_at IS NULL AND EXISTS (SELECT 1 FROM authors AS a1 WHERE a.id = a1.mentor_id AND a1.deleted_at IS NULL AND EXISTS (SELECT 1 FROM authors_to_tags AS att WHERE a1.id = att.author_id AND att.tag_id = $1)) ORDER BY a.id ASC LIMIT $2"`,
      );
    }
  });

  it("excludes untagged authors when comparing ids with ne", async () => {
    // Given an untagged author and authors with two different tags
    await insertAuthor({ first_name: "none" });
    await insertAuthor({ first_name: "one" });
    await insertAuthor({ first_name: "two" });
    await insertTag({ name: "one" });
    await insertTag({ name: "two" });
    await insertAuthorToTag({ author_id: 2, tag_id: 1 });
    await insertAuthorToTag({ author_id: 3, tag_id: 2 });
    const [t] = aliases(Tag);
    // When a tag must have an id different from the first tag
    const result = await newEntityManager().find(Author, { tags: t }, { conditions: { and: [t.id.ne("t:1")] } });
    // Then neither the excluded tag nor an absent tag satisfies the comparison
    expect(result.map((a) => a.firstName)).toEqual(["two"]);
    expect(queries.at(-1)).toMatchInlineSnapshot(
      `"SELECT a.* FROM authors AS a WHERE a.deleted_at IS NULL AND EXISTS (SELECT 1 FROM authors_to_tags AS att WHERE a.id = att.author_id AND att.tag_id != $1) ORDER BY a.id ASC LIMIT $2"`,
    );
  });

  it("includes untagged authors through an explicit null OR branch", async () => {
    // Given an untagged author and authors with excluded and allowed tags
    await insertAuthor({ first_name: "none" });
    await insertAuthor({ first_name: "excluded" });
    await insertAuthor({ first_name: "allowed" });
    await insertTag({ name: "excluded" });
    await insertTag({ name: "allowed" });
    await insertAuthorToTag({ author_id: 2, tag_id: 1 });
    await insertAuthorToTag({ author_id: 3, tag_id: 2 });
    const [t] = aliases(Tag);
    // When either no tag or a tag outside the excluded list is accepted
    const result = await newEntityManager().find(
      Author,
      { tags: t },
      {
        conditions: { or: [t.id.eq(null), t.id.nin(["t:1"])] },
      },
    );
    // Then the null branch includes untagged authors without admitting the excluded tag
    expect(result.map((a) => a.firstName)).toEqual(["none", "allowed"]);
    expect(queries.at(-1)).toMatchInlineSnapshot(
      `"SELECT a.* FROM authors AS a WHERE a.deleted_at IS NULL AND (NOT EXISTS (SELECT 1 FROM authors_to_tags AS att WHERE a.id = att.author_id) OR EXISTS (SELECT 1 FROM authors_to_tags AS att WHERE a.id = att.author_id AND att.tag_id != ALL($1))) ORDER BY a.id ASC LIMIT $2"`,
    );
  });
});
