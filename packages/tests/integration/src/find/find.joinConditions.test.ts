import { ParsedFindQuery, Plugin, alias, aliases } from "joist-orm";
import { Author, Tag } from "src/entities";
import { insertAuthor, insertAuthorToTag, insertBook, insertTag } from "src/entities/inserts";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("em.find / join conditions", () => {
  it("keeps a parent matched by its own field when the ON condition hides its m2o", async () => {
    // Given one Author with a visible mentor and two with a hidden mentor
    await insertAuthor({ first_name: "visible" });
    await insertAuthor({ first_name: "hidden" });
    await insertAuthor({ first_name: "a1", mentor_id: 1 });
    await insertAuthor({ first_name: "a2", mentor_id: 2 });
    await insertAuthor({ first_name: "a3", mentor_id: 2 });
    const em = newEntityManager();
    em.addPlugin(new HideRowsPlugin("authors", "first_name", "hidden"));
    const [a, m] = aliases(Author, Author);
    // When finding Authors by their own name or by having a mentor with any other name
    const authors = await em.find(
      Author,
      { as: a, mentor: m },
      { conditions: { or: [a.firstName.eq("a2"), m.firstName.ne("nobody")] } },
    );
    // Then a hidden mentor does not match, but its Author can still match by its own name
    expect(authors).toMatchEntity([{ firstName: "a1" }, { firstName: "a2" }]);
  });

  it("renders the ON condition after the join columns", async () => {
    // Given a plugin that hides an Author's mentor
    const em = newEntityManager();
    em.addPlugin(new HideRowsPlugin("authors", "first_name", "hidden"));
    const [a, m] = aliases(Author, Author);
    resetQueryCount();
    // When finding Authors by their own name or their mentor's name
    await em.find(
      Author,
      { as: a, mentor: m },
      { conditions: { or: [a.firstName.eq("a2"), m.firstName.eq("visible")] } },
    );
    // Then the policy is part of the LEFT JOIN, not the WHERE
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT DISTINCT ON (a.id, a.id) a.*, a.id FROM authors AS a LEFT OUTER JOIN authors AS a1 ON a.mentor_id = a1.id AND (a1.first_name != $1) WHERE a.deleted_at IS NULL AND (a.first_name = $2 OR a1.first_name = $3) ORDER BY a.id ASC LIMIT $4",
     ]
    `);
  });

  it("orders a parent as if its hidden m2o were missing", async () => {
    // Given a hidden mentor whose name sorts before the visible mentor's
    await insertAuthor({ first_name: "m2" });
    await insertAuthor({ first_name: "m1-hidden" });
    await insertAuthor({ first_name: "a1", mentor_id: 1 });
    await insertAuthor({ first_name: "a2", mentor_id: 2 });
    const em = newEntityManager();
    em.addPlugin(new HideRowsPlugin("authors", "first_name", "m1-hidden"));
    // When ordering Authors by their mentor's name
    const authors = await em.find(Author, {}, { orderBy: { mentor: { firstName: "ASC" } } });
    // Then the Author with the hidden mentor sorts with the Authors that have no mentor
    expect(authors).toMatchEntity([
      { firstName: "a1" },
      { firstName: "m2" },
      { firstName: "m1-hidden" },
      { firstName: "a2" },
    ]);
  });

  it("moves a collection join's ON condition into its EXISTS", async () => {
    // Given a plugin that hides some Books
    const em = newEntityManager();
    em.addPlugin(new HideRowsPlugin("books", "notes", "hidden"));
    resetQueryCount();
    // When finding Authors by their Books' title
    await em.find(Author, { books: { title: "match" } });
    // Then the policy restricts the Books the subquery can match
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT a.* FROM authors AS a WHERE a.deleted_at IS NULL AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND (b.notes != $1) AND b.deleted_at IS NULL AND b.title = $2) ORDER BY a.id ASC LIMIT $3",
     ]
    `);
  });

  it("does not match a parent through a collection row the ON condition hides", async () => {
    // Given two Authors with a matching Book, but the second Author's Book is hidden
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "match", author_id: 1 });
    await insertBook({ title: "match", author_id: 2, notes: "hidden" });
    const em = newEntityManager();
    em.addPlugin(new HideRowsPlugin("books", "notes", "hidden"));
    // When finding Authors by their Books' title
    const authors = await em.find(Author, { books: { title: "match" } });
    // Then only the Author with the visible Book matches
    expect(authors).toMatchEntity([{ firstName: "a1" }]);
  });

  it("treats a collection as empty when the ON condition hides all of its rows", async () => {
    // Given an Author whose only Book is hidden, an Author with a visible Book, and an Author with no Books
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertAuthor({ first_name: "a3" });
    await insertBook({ title: "b1", author_id: 1, notes: "hidden" });
    await insertBook({ title: "b2", author_id: 2 });
    const em = newEntityManager();
    em.addPlugin(new HideRowsPlugin("books", "notes", "hidden"));
    // When finding Authors without Books
    const authors = await em.find(Author, { books: { id: null } });
    // Then the Author whose only Book is hidden counts as having none
    expect(authors).toMatchEntity([{ firstName: "a1" }, { firstName: "a3" }]);
  });

  it("keeps a many-to-many target join that has an ON condition", async () => {
    // Given one Author with a visible Tag and one with a hidden Tag
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertTag({ name: "visible" });
    await insertTag({ name: "hidden" });
    await insertAuthorToTag({ author_id: 1, tag_id: 1 });
    await insertAuthorToTag({ author_id: 2, tag_id: 2 });
    const em = newEntityManager();
    em.addPlugin(new HideRowsPlugin("tags", "name", "hidden"));
    const t = alias(Tag);
    // When finding Authors by either Tag's id, which otherwise only needs the join table
    const authors = await em.find(Author, { tags: t }, { conditions: { and: [t.id.in(["t:1", "t:2"])] } });
    // Then the Author with the hidden Tag does not match
    expect(authors).toMatchEntity([{ firstName: "a1" }]);
  });

  it("applies the ON condition to each find in a batch", async () => {
    // Given two Authors with differently titled Books, but the second Author's Book is hidden
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "b1", author_id: 1 });
    await insertBook({ title: "b2", author_id: 2, notes: "hidden" });
    const em = newEntityManager();
    em.addPlugin(new HideRowsPlugin("books", "notes", "hidden"));
    // When two finds with the same structure are batched
    const results = await Promise.all([
      em.find(Author, { books: { title: "b1" } }),
      em.find(Author, { books: { title: "b2" } }),
    ]);
    // Then the find for the hidden Book's title matches no Author
    expect(results).toMatchEntity([[{ firstName: "a1" }], []]);
  });
});

/** Stands in for an authorization plugin: joins to `table` cannot match rows where `column` is `value`. */
class HideRowsPlugin extends Plugin {
  constructor(
    private table: string,
    private column: string,
    private value: string,
  ) {
    super();
  }

  beforeFind(_meta: unknown, _operation: unknown, query: ParsedFindQuery): void {
    for (const table of query.tables) {
      if ((table.join !== "inner" && table.join !== "outer") || table.table !== this.table) continue;
      table.condition = {
        kind: "exp",
        op: "and",
        conditions: [
          {
            kind: "column",
            alias: table.alias,
            column: this.column,
            dbType: "character varying",
            cond: { kind: "ne", value: this.value },
          },
        ],
      };
    }
  }
}
