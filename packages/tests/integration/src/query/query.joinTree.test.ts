import { expectTypeOf } from "expect-type";
import {
  type JoinTree,
  type Query,
  type QueryJoinInput,
  type QueryJoinList,
  type Subquery,
  alias,
  query,
  queryMaybe,
  table,
  tables,
} from "joist-orm";
import { Author, Book, Comment, SmallPublisher, Tag } from "src/entities";
import { insertAuthor, insertBook, insertBookToTag, insertTag } from "src/entities/inserts";
import { jan1 } from "src/testDates";
import { newEntityManager, queries, resetQueryCount } from "src/testEm";

describe("em.query / join trees", () => {
  it("combines root and nested domain filters with explicit SQL conditions", async () => {
    // Given Alice with two Books
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertBook({ id: 1, author_id: 1, title: "Database design" });
    await insertBook({ id: 2, author_id: 1, title: "Other" });
    // And Bob with a matching Book title
    await insertAuthor({ id: 2, first_name: "Bob" });
    await insertBook({ id: 3, author_id: 2, title: "Database design" });
    // And table bindings for the Author and matching Book
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);

    // When filtering both levels of the tree and adding an explicit condition
    resetQueryCount();
    const rows = await em.query({
      from: a,
      join: { as: a, firstName: "Alice", books: { as: b, title: { ilike: "database%" } } },
      where: b.id.ne("b:2"),
      select: { name: a.firstName, title: b.title },
    });

    // Then the inline conditions filter rows rather than only restricting the join's ON
    expect(rows).toEqual([{ name: "Alice", title: "Database design" }]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT a.first_name AS name, b.title AS title FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE (((a.first_name = $1) AND (b.title ILIKE $2)) AND b.id != $3) AND a.deleted_at IS NULL",
     ]
    `);
    expectTypeOf(rows).toEqualTypeOf<{ name: string; title: string | undefined }[]>();
  });

  it("walks unbound nodes and inherits nullability through required references", async () => {
    // Given Alice with a Book and Bob without Books
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertBook({ author_id: 1, title: "One" });
    await insertAuthor({ id: 2, first_name: "Bob" });
    // And a separately named Author handle for the far end of the path
    const em = newEntityManager();
    const a = table(Author);
    const owner = table(Author, "owner");

    // When projecting through an unbound Book to its required Author
    const rows = await em.query({
      from: a,
      join: { books: { author: { as: owner } } },
      select: { name: a.firstName, owner: owner.firstName },
      orderBy: { name: "ASC" },
    });

    // Then Authors without Books survive and their descendant columns are undefined
    expect(rows).toEqual([
      { name: "Alice", owner: "Alice" },
      { name: "Bob", owner: undefined },
    ]);
    expectTypeOf(rows).toEqualTypeOf<{ name: string; owner: string | undefined }[]>();
  });

  it("keeps required references non-null and nullable references nullable", async () => {
    // Given a Book whose required Author exists and whose reviewer is absent
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertBook({ author_id: 1, title: "One" });
    // And separate bindings for the Author and reviewer
    const em = newEntityManager();
    const [b, a] = tables(Book, Author);
    const reviewer = table(Author, "reviewer");

    // When selecting both relationship paths
    const rows = await em.query({
      from: b,
      join: { author: { as: a }, reviewer: { as: reviewer } },
      select: { author: a.firstName, reviewer: reviewer.firstName },
    });

    // Then only the optional reviewer adds undefined to the result type
    expect(rows).toEqual([{ author: "Alice", reviewer: undefined }]);
    expectTypeOf(rows).toEqualTypeOf<{ author: string; reviewer: string | undefined }[]>();
  });

  it("filters through many-to-many bridges", async () => {
    // Given a Book with a database Tag
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertBook({ id: 1, author_id: 1, title: "One" });
    await insertTag({ id: 1, name: "database" });
    await insertBookToTag({ book_id: 1, tag_id: 1 });
    // And a Book without Tags
    await insertBook({ id: 2, author_id: 1, title: "Two" });
    // And Book and Tag table handles
    const em = newEntityManager();
    const [b, t] = tables(Book, Tag);

    // When the relationship tree binds and filters the Tag
    resetQueryCount();
    const rows = await em.query({ from: b, join: { tags: { as: t, name: "database" } }, select: b.title });

    // Then the bridge links only the tagged Book
    expect(rows).toEqual(["One"]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT b.title AS value FROM books AS b LEFT OUTER JOIN books_to_tags AS btt ON btt.book_id = b.id LEFT OUTER JOIN tags AS t ON t.id = btt.tag_id WHERE (((t.name = $1))) AND b.deleted_at IS NULL",
     ]
    `);
  });

  it("prunes unused paths and compares owning-reference IDs without joining", async () => {
    // Given Alice with a Book
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertBook({ author_id: 1, title: "One" });
    // And a Book root whose reviewer filter is omitted
    const em = newEntityManager();
    const b = table(Book);
    resetQueryCount();

    // When only the owning Author ID condition survives
    const rows = await em.query({
      from: b,
      join: { author: "a:1", reviewer: { firstName: undefined } },
      select: b.title,
    });

    // Then the result needs neither an Author join nor a reviewer join
    expect(rows).toEqual(["One"]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT b.title AS value FROM books AS b WHERE (((b.author_id = $1))) AND b.deleted_at IS NULL",
     ]
    `);
  });

  it("preserves the same collection row multiplicity as flat joins", async () => {
    // Given Alice with two Books
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertBook({ author_id: 1, title: "One" });
    await insertBook({ author_id: 1, title: "Two" });
    // And reusable table bindings and a relationship tree
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);
    const tree = { books: { as: b, title: { ne: "Other" } } };

    // When selecting through equivalent tree and flat joins
    const nested = await em.query({ from: a, join: tree, select: a.firstName });
    const flat = await em.query({ from: a, join: [a.books.as(b)], where: b.title.ne("Other"), select: a.firstName });
    // Then each Book produces a row in both forms
    expect(nested).toEqual(["Alice", "Alice"]);
    expect(nested).toEqual(flat);
  });

  it("deduplicates collection rows with explicit distinct", async () => {
    // Given Alice with two Books
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertBook({ author_id: 1, title: "One" });
    await insertBook({ author_id: 1, title: "Two" });
    // And an Author table
    const em = newEntityManager();
    const a = table(Author);

    // When selecting distinct Author names through matching Books
    const distinct = await em.query({
      from: a,
      join: { books: { title: { ne: "Other" } } },
      distinct: true,
      select: a.firstName,
    });
    // Then Alice appears once
    expect(distinct).toEqual(["Alice"]);
  });

  it("filters a collection by entity ID", async () => {
    // Given Alice with one Book
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertBook({ id: 1, author_id: 1, title: "One" });
    // And Bob without Books
    await insertAuthor({ id: 2, first_name: "Bob" });
    // And an Author table rooted at the collection's owner
    const em = newEntityManager();
    const a = table(Author);

    // When filtering Authors by a Book ID
    resetQueryCount();
    const rows = await em.query({ from: a, join: { books: "b:1" }, select: a.firstName });
    // Then only the Book's Author matches
    expect(rows).toEqual(["Alice"]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT a.first_name AS value FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE ((b.id = $1)) AND a.deleted_at IS NULL",
     ]
    `);
  });

  it("filters a collection by existence", async () => {
    // Given Alice with one Book
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertBook({ author_id: 1, title: "One" });
    // And Bob without Books
    await insertAuthor({ id: 2, first_name: "Bob" });
    // And an Author table
    const em = newEntityManager();
    const a = table(Author);

    // When requiring at least one Book
    resetQueryCount();
    const rows = await em.query({ from: a, join: { books: true }, select: a.firstName });
    // Then the joined primary key supplies the existence test
    expect(rows).toEqual(["Alice"]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT a.first_name AS value FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE ((b.id IS NOT NULL)) AND a.deleted_at IS NULL",
     ]
    `);
  });

  it("filters for an empty collection with null", async () => {
    // Given Alice with one Book
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertBook({ author_id: 1, title: "One" });
    // And Bob without Books
    await insertAuthor({ id: 2, first_name: "Bob" });
    // And an Author table
    const em = newEntityManager();
    const a = table(Author);

    // When requiring no Books
    resetQueryCount();
    const rows = await em.query({ from: a, join: { books: null }, select: a.firstName });
    // Then unmatched collection rows are selected
    expect(rows).toEqual(["Bob"]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT a.first_name AS value FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE ((b.id IS NULL)) AND a.deleted_at IS NULL",
     ]
    `);
  });

  it("filters a collection with an explicit null exclusion", async () => {
    // Given Alice with one Book
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertBook({ author_id: 1, title: "One" });
    // And Bob without Books
    await insertAuthor({ id: 2, first_name: "Bob" });
    // And an Author table
    const em = newEntityManager();
    const a = table(Author);

    // When excluding null Book IDs explicitly
    resetQueryCount();
    const rows = await em.query({ from: a, join: { books: { ne: null } }, select: a.firstName });
    // Then the exclusion also keeps the collection join alive
    expect(rows).toEqual(["Alice"]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "SELECT a.first_name AS value FROM authors AS a LEFT OUTER JOIN books AS b ON b.author_id = a.id AND b.deleted_at IS NULL WHERE ((b.id IS NOT NULL)) AND a.deleted_at IS NULL",
     ]
    `);
  });

  it("excludes soft-deleted collection rows without removing their owner", async () => {
    // Given Alice with a soft-deleted Book
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertBook({ id: 1, author_id: 1, title: "Deleted", deleted_at: jan1 });
    // And reusable Author and Book bindings
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);

    // When projecting the Author's collection
    const rows = await em.query({ from: a, join: { books: { as: b } }, select: { name: a.firstName, title: b.title } });
    // Then the deleted Book becomes undefined without removing Alice
    expect(rows).toEqual([{ name: "Alice", title: undefined }]);
  });

  it("follows references to soft-deleted entities", async () => {
    // Given a live Book whose Author is soft-deleted
    await insertAuthor({ id: 1, first_name: "Deleted Author", deleted_at: jan1 });
    await insertBook({ author_id: 1, title: "Live" });
    // And Author and Book table bindings
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);

    // When following a reference to a deleted Author
    const authors = await em.query({ from: b, join: { author: { as: a } }, select: a.firstName });
    // Then references retain their normal access to deleted entities
    expect(authors).toEqual(["Deleted Author"]);
  });

  it("includes soft-deleted collection rows when requested", async () => {
    // Given Alice with a soft-deleted Book
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertBook({ author_id: 1, title: "Deleted", deleted_at: jan1 });
    // And Author and Book table bindings
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);

    // When opting into deleted rows
    const included = await em.query({
      from: a,
      join: { books: { as: b } },
      softDeletes: "include",
      select: b.title,
    });
    // Then the deleted Book is available
    expect(included).toEqual(["Deleted"]);
  });

  it("hydrates entities selected through a join tree", async () => {
    // Given Alice with one Book
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertBook({ author_id: 1, title: "One" });
    // And Bob without Books
    await insertAuthor({ id: 2, first_name: "Bob" });
    // And an Author table
    const em = newEntityManager();
    const a = table(Author);

    // When selecting entities through an unbound relationship filter
    const entities = await em.query({ from: a, join: { books: { title: "One" } }, select: a });
    // Then the Author is hydrated normally
    expect(entities.map((a) => a.firstName)).toEqual(["Alice"]);
    expectTypeOf(entities).toEqualTypeOf<Author[]>();
  });

  it("preserves nullable tree projections in derived tables", async () => {
    // Given Alice with one Book
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertBook({ author_id: 1, title: "One" });
    // And Bob without Books
    await insertAuthor({ id: 2, first_name: "Bob" });
    // And reusable Author and Book bindings
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);

    // When exposing a nullable Book title through a reusable query
    const titles = query({ from: a, join: { books: { as: b } }, select: { title: b.title }, as: "titles" });
    const rows = await em.query({ from: titles, select: titles, orderBy: { title: "ASC NULLS LAST" } });
    // Then derived-table output retains the join's nullable type and values
    expect(rows).toEqual([{ title: "One" }, { title: undefined }]);
    expectTypeOf(titles).toEqualTypeOf<Subquery<{ title: string | undefined }, "titles">>();
  });

  it("keeps a conditional scalar query with a surviving tree filter", async () => {
    // Given Alice with one Book
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertBook({ author_id: 1, title: "One" });
    // And an Author table for the scalar query
    const em = newEntityManager();
    const a = table(Author);

    // When only a tree filter gives a conditional query meaning
    const count = queryMaybe({ from: a, join: { books: { title: "One" } }, select: a.id.count() });
    const counts = await em.query({ from: a, where: a.id.eq("a:1"), select: { count: count! } });
    // Then it survives and returns the matching Author count
    expect(counts).toEqual([{ count: 1 }]);
  });

  it("prunes a conditional query with only a binding and an omitted filter", () => {
    // Given Author and Book table bindings
    const [a, b] = tables(Author, Book);

    // When the tree contains only an alias and an omitted condition
    const omitted = queryMaybe({ from: a, join: { books: { as: b, title: undefined } }, select: a.id });
    // Then implicit joins do not keep the conditional query alive
    expect(omitted).toBeUndefined();
  });

  it("retains nullable tree projections in compound queries", async () => {
    // Given Alice with a Book and Bob without Books
    await insertAuthor({ id: 1, first_name: "Alice" });
    await insertAuthor({ id: 2, first_name: "Bob" });
    await insertBook({ author_id: 1, title: "One" });
    // And table bindings shared by two independent read operands
    const em = newEntityManager();
    const [a, b] = tables(Author, Book);

    // When combining a nullable tree projection with direct Book titles
    const titles = query({
      union: [
        { from: a, join: { books: { as: b } }, select: { title: b.title } },
        { from: b, select: { title: b.title } },
      ],
      as: "titles",
    });
    const rows = await em.query({ from: titles, select: titles, orderBy: { title: "ASC NULLS LAST" } });

    // Then the compound retains both the Book title and the unmatched Author's undefined
    expect(rows).toEqual([{ title: "One" }, { title: undefined }]);
    expectTypeOf(titles).toEqualTypeOf<Subquery<{ title: string | undefined }, "titles">>();
  });

  it("rejects a root binding that differs from from", async () => {
    // Given separate Author handles
    const em = newEntityManager();
    const a = table(Author);
    const other = table(Author);
    // When the root binding points at a different handle
    // Then it cannot silently replace from
    await expect(em.query({ from: a, join: { as: other }, select: a })).rejects.toThrow("same table handle as from");
  });

  it("rejects a descendant binding that reuses an ancestor handle", async () => {
    // Given an Author table
    const em = newEntityManager();
    const a = table(Author);

    // When a descendant reuses its ancestor handle
    // Then the caller must create a separate alias
    await expect(em.query({ from: a, join: { books: { author: { as: a } } }, select: a })).rejects.toThrow(
      "bound more than once",
    );
  });

  it("rejects a binding for the wrong entity", async () => {
    // Given an Author table
    const em = newEntityManager();
    const a = table(Author);

    // When an untyped caller binds an Author where a Book is required
    // Then metadata validation rejects the wrong entity
    await expect(em.query({ from: a, join: { books: { as: a } }, select: a } as never)).rejects.toThrow(
      "must be a Book table",
    );
  });

  it("rejects polymorphic traversal", async () => {
    // Given Comment and Author tables
    const em = newEntityManager();
    const [c, a] = tables(Comment, Author);

    // When an untyped caller requests a polymorphic relationship
    // Then the unsupported traversal is rejected explicitly
    await expect(em.query({ from: c, join: { parent: { as: a } }, select: c } as never)).rejects.toThrow(
      "polymorphic field Comment.parent",
    );
  });

  it("rejects inherited fields", async () => {
    // Given a SmallPublisher table
    const em = newEntityManager();
    const sp = table(SmallPublisher);

    // When a tree filters an inherited CTI field
    // Then it asks for an explicit base-table join instead
    await expect(em.query({ from: sp, join: { name: "Press" }, select: sp } as never)).rejects.toThrow(
      "inherited field SmallPublisher.name",
    );
  });

  it("checks trees against generated entity types", () => {
    // Given tree assertions against generated Author and Book models
    // When TypeScript checks result types and invalid tree inputs
    // Then invalid calls remain outside runtime execution
    expect(typeof treeTypeAssertions).toBe("function");
  });
});

/** Checks public query entry points without executing deliberately invalid inputs. */
function treeTypeAssertions() {
  // Given entity tables and a source without domain metadata
  const em = newEntityManager();
  const [a, b, c] = tables(Author, Book, Comment);
  const derived = query({ from: a, select: { name: a.firstName } });
  // And a broadly annotated tree whose literal bindings have been erased
  const broadTree: JoinTree<Author> = { books: { title: "One" } };
  // And a broadly annotated nested Book tree
  const broadBooks: JoinTree<Book> = { as: b };
  // And a join input whose annotation erased whether it is a list or tree
  const broadJoinInput = { books: { as: b } } as QueryJoinInput;

  // When a reusable literal uses the Query shape
  const input = { from: a, join: { books: { as: b } }, select: { title: b.title } } satisfies Query;
  // Then inference retains the nullable Book title
  expectTypeOf(em.query(input)).toEqualTypeOf<Promise<{ title: string | undefined }[]>>();
  expectTypeOf(em.execute(input)).toMatchTypeOf<Promise<{ rows: { title: string | undefined }[] }>>();
  // And queries that preserve an omitted join or explicitly choose the list form
  const noJoin = { from: a, select: { name: a.firstName } } satisfies Query;
  const typedNoJoin: Query<{ name: typeof a.firstName }, []> = noJoin;
  const joinList: QueryJoinList = [a.books.as(b)];
  expectTypeOf(em.query(noJoin)).toEqualTypeOf<Promise<{ name: string }[]>>();
  expectTypeOf(em.query(typedNoJoin)).toEqualTypeOf<Promise<{ name: string }[]>>();
  em.query({ from: a, join: joinList, select: { title: b.title } });
  const preciseTree = { books: { as: b } } satisfies JoinTree<Author>;
  expectTypeOf(em.query({ from: a, join: preciseTree, select: { title: b.title } })).toEqualTypeOf<
    Promise<{ title: string | undefined }[]>
  >();

  // When a tree uses invalid fields, values, bindings, or roots
  // Then each public input rejects the mismatch
  // @ts-expect-error the full join input union has lost the join shape
  em.query({ from: a, join: broadJoinInput, select: a.firstName });
  // @ts-expect-error reusable queries also need a known join shape
  query({ from: a, join: broadJoinInput, select: a.firstName });
  // @ts-expect-error conditional queries also need a known join shape
  queryMaybe({ from: a, join: broadJoinInput, select: a.firstName });
  // @ts-expect-error execute also needs a known join shape
  em.execute({ from: a, join: broadJoinInput, select: a.firstName });
  // @ts-expect-error compound operands also need a known join shape
  query({ union: [{ from: a, join: broadJoinInput, select: { title: b.title } }, input] });
  // @ts-expect-error a broad root annotation erases the tree bindings
  em.query({ from: a, join: broadTree, select: a.firstName });
  // @ts-expect-error a broad nested annotation also erases the tree bindings
  em.query({ from: a, join: { books: broadBooks }, select: a.firstName });
  // @ts-expect-error reusable queries reject broad tree annotations too
  query({ from: a, join: broadTree, select: a.firstName });
  // @ts-expect-error compound operands reject broad tree annotations too
  query({ union: [{ from: a, join: broadTree, select: { title: b.title } }, input] });
  // @ts-expect-error Book titles are strings in standalone tree fragments too
  const invalidTitle = { title: 123 } satisfies JoinTree<Book>;
  void invalidTitle;
  // @ts-expect-error Nested Book titles are strings too
  const invalidNestedTitle = { books: { title: 123 } } satisfies JoinTree<Author>;
  void invalidNestedTitle;
  // @ts-expect-error Author has no field named typo
  em.query({ from: a, join: { typo: "Alice" }, select: a });
  // And a tree stored in a variable with an extra boolean property
  const unknownField = { books: { title: "One", typo: true } };
  // When the variable is used as an Author join tree
  // Then the unknown Book field is rejected
  // @ts-expect-error unknown join tree field 'typo'
  em.query({ from: a, join: unknownField, select: a });
  // @ts-expect-error Book has no field named typo
  em.query({ from: a, join: { books: { typo: "One" } }, select: a });
  // @ts-expect-error Book titles are strings
  em.query({ from: a, join: { books: { title: 123 } }, select: a });
  // @ts-expect-error Author is not a Book binding
  em.query({ from: a, join: { books: { as: a } }, select: a });
  // @ts-expect-error find aliases are not table bindings
  em.query({ from: a, join: { as: alias(Author) }, select: a });
  // @ts-expect-error derived tables have no domain relationship tree
  em.query({ from: derived, join: { firstName: "Alice" }, select: derived });
  // @ts-expect-error tree entries cannot be mixed into flat join lists
  em.query({ from: a, join: [{ books: { as: b } }], select: a });
  // @ts-expect-error polymorphic traversal is deferred
  em.query({ from: c, join: { parent: { as: a } }, select: c });
  // @ts-expect-error Book was not bound in this tree
  em.query({ from: a, join: { firstName: "Alice" }, select: { title: b.title } });
  // @ts-expect-error compound operands also validate their domain filters
  query({ union: [{ from: a, join: { books: { title: 123 } }, select: { title: b.title } }, input] });
}
