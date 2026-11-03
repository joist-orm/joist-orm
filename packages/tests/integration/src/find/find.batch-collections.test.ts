import { Plugin, type RowData, aliases } from "joist-orm";
import { Author, Book, Tag } from "src/entities";
import {
  insertAuthor,
  insertAuthorToTag,
  insertBook,
  insertBookReview,
  insertPublisher,
  insertTag,
} from "src/entities/inserts";
import { isPreloadingEnabled, newEntityManager, queries, resetQueryCount, testDriver } from "src/testEm";

describe("find.batch-collections", () => {
  it("shares collection membership while preserving each entry's results and ordering", async () => {
    // Given authors with overlapping book titles, including duplicate matching children
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertAuthor({ first_name: "a3" });
    await insertBook({ title: "one", author_id: 1 });
    await insertBook({ title: "one", author_id: 1 });
    await insertBook({ title: "two", author_id: 1 });
    await insertBook({ title: "two", author_id: 2 });
    await insertBook({ title: "three", author_id: 3 });
    // And a matching author also has a title that no call requests
    await insertBook({ title: "unrequested", author_id: 1 });
    const em = newEntityManager();
    resetQueryCount();
    // When concurrent finds use overlapping lists with a shared order
    const results = await Promise.all([
      em.find(Author, { books: { title: { in: ["one", "two"] } } }, { orderBy: { firstName: "DESC" } }),
      em.find(Author, { books: { title: { in: ["one", "missing"] } } }, { orderBy: { firstName: "DESC" } }),
    ]);
    // Then each author occurs once in each matching entry, in the requested order
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["a2", "a1"], ["a1"]]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0) AS MATERIALIZED (SELECT unnest($1::int[]), unnest_arrays($2::character varying[][])),  _cand AS MATERIALIZED (SELECT a AS _entity, ARRAY(SELECT b.title FROM books AS b WHERE (a.id = b.author_id AND b.deleted_at IS NULL) AND b.title = ANY($3)) AS _c0, a.first_name AS _o0, a.id AS _o1 FROM authors AS a WHERE a.deleted_at IS NULL AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL AND b.title = ANY($4))),  _matched AS MATERIALIZED (SELECT a._entity, a._o0, a._o1, ARRAY(SELECT _find.tag FROM _find WHERE (a._c0 && _find.arg0)) AS _tags FROM _cand AS a) SELECT (a._entity).*, a._tags FROM _matched AS a WHERE cardinality(a._tags) > 0 ORDER BY a._o0 DESC, a._o1 ASC LIMIT $5",
     ]
    `);
  });

  it("preserves no-children branches for many-to-many collections", async () => {
    // Given authors with no tags, overlapping tags, and an unrelated tag
    for (const first_name of ["none", "both", "one", "other"]) await insertAuthor({ first_name });
    for (const name of ["one", "two", "other"]) await insertTag({ name });
    await insertAuthorToTag({ author_id: 2, tag_id: 1 });
    await insertAuthorToTag({ author_id: 2, tag_id: 2 });
    await insertAuthorToTag({ author_id: 3, tag_id: 1 });
    await insertAuthorToTag({ author_id: 4, tag_id: 3 });
    const em = newEntityManager();
    const [t] = aliases(Tag);
    resetQueryCount();
    // When each entry accepts untagged authors or its own tag list
    const results = await Promise.all(
      [["t:1"], ["t:2"], []].map((ids) =>
        em.find(Author, { tags: t }, { conditions: { or: [t.id.eq(null), t.id.in(ids)] } }),
      ),
    );
    // Then an empty list accepts only authors with no tags
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([
      ["none", "both", "one"],
      ["none", "both"],
      ["none"],
    ]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0) AS MATERIALIZED (SELECT unnest($1::int[]), unnest_arrays($2::int[][])),  _cand AS MATERIALIZED (SELECT a AS _entity, (NOT EXISTS (SELECT 1 FROM authors_to_tags AS att WHERE a.id = att.author_id)) AS _c0, ARRAY(SELECT att.tag_id FROM authors_to_tags AS att WHERE (a.id = att.author_id) AND att.tag_id = ANY($3)) AS _c1, a.id AS _o0 FROM authors AS a WHERE a.deleted_at IS NULL AND (NOT EXISTS (SELECT 1 FROM authors_to_tags AS att WHERE a.id = att.author_id) OR EXISTS (SELECT 1 FROM authors_to_tags AS att WHERE a.id = att.author_id AND att.tag_id = ANY($4)))),  _matched AS MATERIALIZED (SELECT a._entity, a._o0, ARRAY(SELECT _find.tag FROM _find WHERE ((a._c0 OR a._c1 && _find.arg0))) AS _tags FROM _cand AS a) SELECT (a._entity).*, a._tags FROM _matched AS a WHERE cardinality(a._tags) > 0 ORDER BY a._o0 ASC LIMIT $5",
     ]
    `);
  });

  it("keeps shared child constraints on the same child as the varying equality", async () => {
    // Given one author whose title and order constraints match different books
    await insertAuthor({ first_name: "split" });
    await insertBook({ title: "one", order: 2, author_id: 1 });
    await insertBook({ title: "two", order: 1, author_id: 1 });
    // And another author with both constraints on one book
    await insertAuthor({ first_name: "same" });
    await insertBook({ title: "one", order: 1, author_id: 2 });
    const em = newEntityManager();
    // When the title varies but the book order stays fixed
    const results = await Promise.all(["one", "two"].map((title) => em.find(Author, { books: { title, order: 1 } })));
    // Then matching a different child cannot satisfy the shared constraint
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["same"], ["split"]]);
  });

  it("matches multiple varying conditions on the same child", async () => {
    // Given an author whose title/order constraints match different books
    await insertAuthor({ first_name: "cross" });
    await insertBook({ title: "one", order: 2, author_id: 1 });
    await insertBook({ title: "two", order: 1, author_id: 1 });
    // And authors with genuine same-child matches for each entry
    await insertAuthor({ first_name: "first" });
    await insertAuthor({ first_name: "second" });
    await insertBook({ title: "one", order: 1, author_id: 2 });
    await insertBook({ title: "two", order: 2, author_id: 3 });
    const em = newEntityManager();
    resetQueryCount();
    // When both the title and order vary together
    const results = await Promise.all([
      em.find(Author, { books: { title: "one", order: 1 } }),
      em.find(Author, { books: { title: "two", order: 2 } }),
    ]);
    // Then neither entry combines the title of one book with the order of another
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["first"], ["second"]]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0, arg1) AS MATERIALIZED (SELECT unnest($1::int[]), unnest_arrays($2::character varying[][]), unnest_arrays($3::int[][])),  _cand AS MATERIALIZED (SELECT a AS _entity, ARRAY(SELECT ROW(b) FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL) AS _c0, a.id AS _o0 FROM authors AS a WHERE a.deleted_at IS NULL AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL AND b.title = ANY($4) AND b."order" = ANY($5))),  _matched AS MATERIALIZED (SELECT a._entity, a._o0, ARRAY(SELECT _find.tag FROM _find WHERE (EXISTS (SELECT 1 FROM unnest(a._c0) AS _r0(_c0 books) WHERE ((_r0._c0).title = ANY(_find.arg0) AND (_r0._c0)."order" = ANY(_find.arg1))))) AS _tags FROM _cand AS a) SELECT (a._entity).*, a._tags FROM _matched AS a WHERE cardinality(a._tags) > 0 ORDER BY a._o0 ASC LIMIT $6",
     ]
    `);
  });

  it("matches negative membership without merging exclusions", async () => {
    // Given an author with one book
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "one", author_id: 1 });
    const em = newEntityManager();
    resetQueryCount();
    // When concurrent entries exclude different titles
    const results = await Promise.all(
      ["one", "two"].map((title) => em.find(Author, { books: { title: { nin: [title] } } })),
    );
    // Then exclusion remains specific to each entry
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([[], ["a1"]]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0) AS MATERIALIZED (SELECT unnest($1::int[]), unnest_arrays($2::character varying[][])),  _cand AS MATERIALIZED (SELECT a AS _entity, ARRAY(SELECT ROW(b) FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL) AS _c0, a.id AS _o0 FROM authors AS a WHERE a.deleted_at IS NULL AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL AND TRUE)),  _matched AS MATERIALIZED (SELECT a._entity, a._o0, ARRAY(SELECT _find.tag FROM _find WHERE (EXISTS (SELECT 1 FROM unnest(a._c0) AS _r0(_c0 books) WHERE ((_r0._c0).title != ALL(_find.arg0))))) AS _tags FROM _cand AS a) SELECT (a._entity).*, a._tags FROM _matched AS a WHERE cardinality(a._tags) > 0 ORDER BY a._o0 ASC LIMIT $3",
     ]
    `);
  });

  it("retains shared parent joins and excludes soft-deleted children", async () => {
    // Given authors at two publishers with matching books
    await insertPublisher({ id: 1, name: "selected" });
    await insertPublisher({ id: 2, name: "other" });
    await insertAuthor({ first_name: "selected", publisher_id: 1 });
    await insertAuthor({ first_name: "other", publisher_id: 2 });
    await insertBook({ title: "one", author_id: 1 });
    await insertBook({ title: "one", author_id: 2 });
    // And the selected author's second title is soft-deleted
    await insertBook({ title: "two", author_id: 1, deleted_at: new Date() });
    const em = newEntityManager();
    resetQueryCount();
    // When both entries share the publisher restriction
    const results = await Promise.all(
      ["one", "two"].map((title) => em.find(Author, { publisher: { name: "selected" }, books: { title } })),
    );
    // Then neither the unrelated publisher nor the deleted child contributes a match
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["selected"], []]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0) AS MATERIALIZED (SELECT unnest($1::int[]), unnest_arrays($2::character varying[][])),  _cand AS MATERIALIZED (SELECT a AS _entity, ARRAY(SELECT b.title FROM books AS b WHERE (a.id = b.author_id AND b.deleted_at IS NULL) AND b.title = ANY($3)) AS _c0, a.id AS _o0 FROM authors AS a LEFT OUTER JOIN publishers AS p ON a.publisher_id = p.id WHERE a.deleted_at IS NULL AND p.name = $4 AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL AND b.title = ANY($5))),  _matched AS MATERIALIZED (SELECT a._entity, a._o0, ARRAY(SELECT _find.tag FROM _find WHERE (a._c0 && _find.arg0)) AS _tags FROM _cand AS a) SELECT (a._entity).*, a._tags FROM _matched AS a WHERE cardinality(a._tags) > 0 ORDER BY a._o0 ASC LIMIT $6",
     ]
    `);
  });

  it("preserves the entity limit across the union of entries", async () => {
    // Given two authors that match different entries
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "one", author_id: 1 });
    await insertBook({ title: "two", author_id: 2 });
    // And an entity limit smaller than the union
    const em = newEntityManager();
    em.entityLimit = 2;
    // When the entries are batched
    const result = Promise.all(["one", "two"].map((title) => em.find(Author, { books: { title } })));
    // Then the normal entity-limit check still rejects the batch
    await expect(result).rejects.toThrow("Query returned more than 2 entityLimit rows");
  });

  it("merges populate hints when they do not add preload joins", async () => {
    // Given two authors whose books match different entries
    await insertAuthor({ first_name: "a1" });
    await insertAuthor({ first_name: "a2" });
    await insertBook({ title: "one", author_id: 1 });
    await insertBook({ title: "two", author_id: 2 });
    const em = newEntityManager();
    resetQueryCount();
    // When each find also requests its author's books
    const results = await Promise.all(
      ["one", "two"].map((title) => em.find(Author, { books: { title } }, { populate: "books" })),
    );
    // Then each caller receives its own author with the requested books loaded
    expect(results.map((rows) => rows.flatMap((a) => a.books.get.map((b) => b.title)))).toEqual([["one"], ["two"]]);
    // And merging depends on actual preload joins, not the presence of a hint
    expect(queries[0].includes("_cand AS MATERIALIZED")).toBe(!isPreloadingEnabled);
  });

  it("keeps shared bound raw conditions in the candidate search only", async () => {
    // Given an adult and a child with the same book title
    await insertAuthor({ first_name: "adult", age: 30 });
    await insertAuthor({ first_name: "child", age: 10 });
    await insertBook({ title: "one", author_id: 1 });
    await insertBook({ title: "one", author_id: 2 });
    const em = newEntityManager();
    const [a] = aliases(Author);
    resetQueryCount();
    // When nested shared AND conditions include a bound raw age restriction
    const results = await Promise.all(
      ["one", "two"].map((title) =>
        em.find(
          Author,
          { as: a, books: { title } },
          {
            conditions: { and: [{ and: [a.age.raw("> coalesce(?, 0)", [20])] }] },
          },
        ),
      ),
    );
    // Then the child is excluded and the raw restriction is not projected or checked per entry
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["adult"], []]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0) AS MATERIALIZED (SELECT unnest($1::int[]), unnest_arrays($2::character varying[][])),  _cand AS MATERIALIZED (SELECT a AS _entity, ARRAY(SELECT b.title FROM books AS b WHERE (a.id = b.author_id AND b.deleted_at IS NULL) AND b.title = ANY($3)) AS _c0, a.id AS _o0 FROM authors AS a WHERE a.deleted_at IS NULL AND (a.age > coalesce($4, 0)) AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL AND b.title = ANY($5))),  _matched AS MATERIALIZED (SELECT a._entity, a._o0, ARRAY(SELECT _find.tag FROM _find WHERE (a._c0 && _find.arg0)) AS _tags FROM _cand AS a) SELECT (a._entity).*, a._tags FROM _matched AS a WHERE cardinality(a._tags) > 0 ORDER BY a._o0 ASC LIMIT $6",
     ]
    `);
  });

  it("preserves OR branches below shared AND conditions", async () => {
    // Given two adults whose books match different entries
    await insertAuthor({ first_name: "one", age: 30 });
    await insertAuthor({ first_name: "two", age: 30 });
    await insertBook({ title: "one", author_id: 1 });
    await insertBook({ title: "two", author_id: 2 });
    // And an adult with no books and a child who must be excluded
    await insertAuthor({ first_name: "none", age: 30 });
    await insertAuthor({ first_name: "child", age: 10 });
    const em = newEntityManager();
    const [a, b] = aliases(Author, Book);
    resetQueryCount();
    // When a shared raw restriction surrounds a no-books-or-matching-book expression
    const results = await Promise.all(
      ["b:1", "b:2"].map((id) =>
        em.find(
          Author,
          { as: a, books: b },
          {
            conditions: { and: [a.age.raw("> ?", [20]), { or: [b.id.eq(null), b.id.in([id])] }] },
          },
        ),
      ),
    );
    // Then each entry retains the no-books branch without inheriting the other's book match
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([
      ["one", "none"],
      ["two", "none"],
    ]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0) AS MATERIALIZED (SELECT unnest($1::int[]), unnest_arrays($2::int[][])),  _cand AS MATERIALIZED (SELECT a AS _entity, (NOT EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id)) AS _c0, ARRAY(SELECT b.id FROM books AS b WHERE (a.id = b.author_id) AND b.id = ANY($3)) AS _c1, a.id AS _o0 FROM authors AS a WHERE a.deleted_at IS NULL AND a.age > $4 AND (NOT EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id) OR EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.id = ANY($5)))),  _matched AS MATERIALIZED (SELECT a._entity, a._o0, ARRAY(SELECT _find.tag FROM _find WHERE ((a._c0 OR a._c1 && _find.arg0))) AS _tags FROM _cand AS a) SELECT (a._entity).*, a._tags FROM _matched AS a WHERE cardinality(a._tags) > 0 ORDER BY a._o0 ASC LIMIT $6",
     ]
    `);
  });

  it("falls back for bound raw conditions that must be projected under OR", async () => {
    // Given an author accepted only by the collection branch
    await insertAuthor({ first_name: "child", age: 10 });
    await insertBook({ title: "one", author_id: 1 });
    const em = newEntityManager();
    const [a, b] = aliases(Author, Book);
    resetQueryCount();
    // When a bound raw restriction is an alternative to the varying collection
    const results = await Promise.all(
      ["one", "two"].map((title) =>
        em.find(
          Author,
          { as: a, books: b },
          {
            conditions: { or: [a.age.raw("> ?", [20]), b.title.eq(title)] },
          },
        ),
      ),
    );
    // Then the second entry cannot inherit the first entry's collection match
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["child"], []]);
    expect(queries[0].includes("_cand AS MATERIALIZED")).toBe(false);
  });

  it("merges when a populate hint produces no preload joins", async () => {
    // Given an author with a book matching only the first entry
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "one", author_id: 1 });
    const em = newEntityManager();
    resetQueryCount();
    // When an empty hint asks the preloader for no relations
    const results = await Promise.all(
      ["one", "two"].map((title) => em.find(Author, { books: { title } }, { populate: {} })),
    );
    // Then each entry still receives exactly its matching authors
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["a1"], []]);
    // And even an installed preloader's empty join list allows merging
    expect(queries[0].includes("_cand AS MATERIALIZED")).toBe(true);
  });

  it("preserves to-one joined ordering in each merged entry", async () => {
    // Given authors whose publisher names sort in the opposite order to their ids
    await insertPublisher({ id: 1, name: "z" });
    await insertPublisher({ id: 2, name: "a" });
    await insertAuthor({ first_name: "z-publisher", publisher_id: 1 });
    await insertAuthor({ first_name: "a-publisher", publisher_id: 2 });
    await insertBook({ title: "one", author_id: 1 });
    await insertBook({ title: "two", author_id: 1 });
    await insertBook({ title: "one", author_id: 2 });
    // And an author with no publisher sorts last under PostgreSQL's default ASC null ordering
    await insertAuthor({ first_name: "no-publisher" });
    await insertBook({ title: "two", author_id: 3 });
    const em = newEntityManager();
    resetQueryCount();
    // When the entries request ordering by a to-one joined column
    const results = await Promise.all(
      ["one", "two"].map((title) => em.find(Author, { books: { title } }, { orderBy: { publisher: { name: "ASC" } } })),
    );
    // Then each entry retains joined ordering, including the null publisher
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([
      ["a-publisher", "z-publisher"],
      ["z-publisher", "no-publisher"],
    ]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0) AS MATERIALIZED (SELECT unnest($1::int[]), unnest_arrays($2::character varying[][])),  _cand AS MATERIALIZED (SELECT a AS _entity, ARRAY(SELECT b.title FROM books AS b WHERE (a.id = b.author_id AND b.deleted_at IS NULL) AND b.title = ANY($3)) AS _c0, p.name AS _o0, a.id AS _o1 FROM authors AS a LEFT OUTER JOIN publishers AS p ON a.publisher_id = p.id WHERE a.deleted_at IS NULL AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL AND b.title = ANY($4))),  _matched AS MATERIALIZED (SELECT a._entity, a._o0, a._o1, ARRAY(SELECT _find.tag FROM _find WHERE (a._c0 && _find.arg0)) AS _tags FROM _cand AS a) SELECT (a._entity).*, a._tags FROM _matched AS a WHERE cardinality(a._tags) > 0 ORDER BY a._o0 ASC, a._o1 ASC LIMIT $5",
     ]
    `);
  });

  it("merges different parent references with a shared collection filter", async () => {
    // Given authors at two publishers with matching books
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 2 });
    await insertBook({ title: "shared", author_id: 1 });
    await insertBook({ title: "shared", author_id: 2 });
    // And an author whose publisher matches but whose book does not
    await insertAuthor({ first_name: "excluded", publisher_id: 1 });
    await insertBook({ title: "other", author_id: 3 });
    const em = newEntityManager();
    resetQueryCount();
    // When callers differ only on their publisher reference
    const results = await Promise.all(
      ["p:1", "p:2"].map((publisher) => em.find(Author, { publisher, books: { title: "shared" } })),
    );
    // Then the candidate phase excludes authors without shared books before the exact-match phase checks publishers
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["a1"], ["a2"]]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0) AS MATERIALIZED (SELECT unnest($1::int[]), unnest_arrays($2::int[][])),  _cand AS MATERIALIZED (SELECT a AS _entity, a.publisher_id AS _c0, a.id AS _o0 FROM authors AS a WHERE a.deleted_at IS NULL AND a.publisher_id = ANY($3) AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL AND b.title = $4)),  _matched AS MATERIALIZED (SELECT a._entity, a._o0, ARRAY(SELECT _find.tag FROM _find WHERE (a._c0 = ANY(_find.arg0))) AS _tags FROM _cand AS a) SELECT (a._entity).*, a._tags FROM _matched AS a WHERE cardinality(a._tags) > 0 ORDER BY a._o0 ASC LIMIT $5",
     ]
    `);
  });

  it("merges overlapping parent lists without duplicating authors", async () => {
    // Given authors at three publishers, all with the required book
    for (const id of [1, 2, 3]) {
      await insertPublisher({ id, name: `p${id}` });
      await insertAuthor({ first_name: `a${id}`, publisher_id: id });
      await insertBook({ title: "shared", author_id: id });
    }
    const em = newEntityManager();
    resetQueryCount();
    // When publisher lists overlap and contain duplicate ids
    const results = await Promise.all(
      [
        ["p:1", "p:2", "p:2"],
        ["p:2", "p:3"],
      ].map((publishers) => em.find(Author, { publisher: publishers, books: { title: "shared" } })),
    );
    // Then each author appears once in each matching entry
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([
      ["a1", "a2"],
      ["a2", "a3"],
    ]);
    expect(queries[0].includes("_cand AS MATERIALIZED")).toBe(true);
  });

  it("merges varying values from a to-one join", async () => {
    // Given authors at publishers with different names and the same book title
    await insertPublisher({ id: 1, name: "first" });
    await insertPublisher({ id: 2, name: "second" });
    await insertAuthor({ first_name: "a1", publisher_id: 1 });
    await insertAuthor({ first_name: "a2", publisher_id: 2 });
    await insertBook({ title: "shared", author_id: 1 });
    await insertBook({ title: "shared", author_id: 2 });
    const em = newEntityManager();
    resetQueryCount();
    // When callers vary the joined publisher name instead of the local foreign key
    const results = await Promise.all(
      ["first", "second"].map((name) => em.find(Author, { publisher: { name }, books: { title: "shared" } })),
    );
    // Then the joined value survives candidate materialization and identifies the matching entry
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["a1"], ["a2"]]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0) AS MATERIALIZED (SELECT unnest($1::int[]), unnest_arrays($2::character varying[][])),  _cand AS MATERIALIZED (SELECT a AS _entity, p.name AS _c0, a.id AS _o0 FROM authors AS a LEFT OUTER JOIN publishers AS p ON a.publisher_id = p.id WHERE a.deleted_at IS NULL AND p.name = ANY($3) AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL AND b.title = $4)),  _matched AS MATERIALIZED (SELECT a._entity, a._o0, ARRAY(SELECT _find.tag FROM _find WHERE (a._c0 = ANY(_find.arg0))) AS _tags FROM _cand AS a) SELECT (a._entity).*, a._tags FROM _matched AS a WHERE cardinality(a._tags) > 0 ORDER BY a._o0 ASC LIMIT $5",
     ]
    `);
  });

  it("preserves null OR branches when parent values vary", async () => {
    // Given authors with unknown or different ages, all with the required book
    await insertAuthor({ first_name: "unknown" });
    await insertAuthor({ first_name: "thirty", age: 30 });
    await insertAuthor({ first_name: "forty", age: 40 });
    for (const author_id of [1, 2, 3]) await insertBook({ title: "shared", author_id });
    const em = newEntityManager();
    const [a] = aliases(Author);
    resetQueryCount();
    // When each entry accepts unknown ages or its own age list
    const results = await Promise.all(
      [[30], [40], []].map((ages) =>
        em.find(
          Author,
          { as: a, books: { title: "shared" } },
          {
            conditions: { or: [a.age.eq(null), a.age.in(ages)] },
          },
        ),
      ),
    );
    // Then null matches only through the shared OR branch, including for an empty list
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([
      ["unknown", "thirty"],
      ["unknown", "forty"],
      ["unknown"],
    ]);
    expect(queries[0].includes("_cand AS MATERIALIZED")).toBe(true);
  });

  it("preserves parent/child pairings when both filters vary", async () => {
    // Given a book that matches only the cross-combination of two requested filters
    await insertPublisher({ id: 1, name: "p1" });
    await insertPublisher({ id: 2, name: "p2" });
    await insertAuthor({ first_name: "cross", publisher_id: 1 });
    await insertBook({ title: "two", author_id: 1 });
    // And authors whose publisher and title match their respective entries
    await insertAuthor({ first_name: "first", publisher_id: 1 });
    await insertAuthor({ first_name: "second", publisher_id: 2 });
    await insertBook({ title: "one", author_id: 2 });
    await insertBook({ title: "two", author_id: 3 });
    const em = newEntityManager();
    resetQueryCount();
    // When each publisher is paired with a different required title
    const results = await Promise.all([
      em.find(Author, { publisher: "p:1", books: { title: "one" } }),
      em.find(Author, { publisher: "p:2", books: { title: "two" } }),
    ]);
    // Then neither caller receives the cross-combination of parent and child filters
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["first"], ["second"]]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0, arg1) AS MATERIALIZED (SELECT unnest($1::int[]), unnest_arrays($2::int[][]), unnest_arrays($3::character varying[][])),  _cand AS MATERIALIZED (SELECT a AS _entity, a.publisher_id AS _c0, ARRAY(SELECT b.title FROM books AS b WHERE (a.id = b.author_id AND b.deleted_at IS NULL) AND b.title = ANY($4)) AS _c1, a.id AS _o0 FROM authors AS a WHERE a.deleted_at IS NULL AND a.publisher_id = ANY($5) AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL AND b.title = ANY($6))),  _matched AS MATERIALIZED (SELECT a._entity, a._o0, ARRAY(SELECT _find.tag FROM _find WHERE (a._c0 = ANY(_find.arg0) AND a._c1 && _find.arg1)) AS _tags FROM _cand AS a) SELECT (a._entity).*, a._tags FROM _matched AS a WHERE cardinality(a._tags) > 0 ORDER BY a._o0 ASC LIMIT $7",
     ]
    `);
  });

  it("keeps nested review matches attached to their own books", async () => {
    // Given an author whose matching title and high-rated review belong to different books
    await insertAuthor({ first_name: "split" });
    await insertBook({ title: "one", author_id: 1 });
    await insertBookReview({ book_id: 1, rating: 1 });
    await insertBook({ title: "two", author_id: 1 });
    await insertBookReview({ book_id: 2, rating: 5 });
    // And authors whose titles and review ratings match on the same book
    await insertAuthor({ first_name: "first" });
    await insertBook({ title: "one", author_id: 2 });
    await insertBookReview({ book_id: 3, rating: 5 });
    await insertAuthor({ first_name: "second" });
    await insertBook({ title: "two", author_id: 3 });
    await insertBookReview({ book_id: 4, rating: 3 });
    const em = newEntityManager();
    resetQueryCount();
    // When both the book title and nested review threshold vary
    const results = await Promise.all([
      em.find(Author, { books: { title: "one", reviews: { rating: { gte: 5 } } } }),
      em.find(Author, { books: { title: "two", reviews: { rating: { gte: 3 } } } }),
    ]);
    // Then a review on another book cannot satisfy the first entry
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["first"], ["split", "second"]]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0, arg1) AS MATERIALIZED (SELECT unnest($1::int[]), unnest_arrays($2::character varying[][]), unnest($3::int[])),  _cand AS MATERIALIZED (SELECT a AS _entity, ARRAY(SELECT ROW(b, ARRAY(SELECT ROW(br) FROM book_reviews AS br WHERE b.id = br.book_id)) FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL) AS _c0, a.id AS _o0 FROM authors AS a WHERE a.deleted_at IS NULL AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL AND b.title = ANY($4) AND EXISTS (SELECT 1 FROM book_reviews AS br WHERE b.id = br.book_id AND br.rating >= $5))),  _matched AS MATERIALIZED (SELECT a._entity, a._o0, ARRAY(SELECT _find.tag FROM _find WHERE (EXISTS (SELECT 1 FROM unnest(a._c0) AS _r0(_c0 books, _c1 record[]) WHERE ((_r0._c0).title = ANY(_find.arg0) AND EXISTS (SELECT 1 FROM unnest(_r0._c1) AS _r1(_c0 book_reviews) WHERE ((_r1._c0).rating >= _find.arg1)))))) AS _tags FROM _cand AS a) SELECT (a._entity).*, a._tags FROM _matched AS a WHERE cardinality(a._tags) > 0 ORDER BY a._o0 ASC LIMIT $6",
     ]
    `);
  });

  it("matches varying conditions across independent collections", async () => {
    // Given authors with opposite book/tag pairings
    await insertAuthor({ first_name: "first" });
    await insertAuthor({ first_name: "second" });
    await insertAuthor({ first_name: "cross" });
    await insertBook({ title: "one", author_id: 1 });
    await insertBook({ title: "two", author_id: 2 });
    await insertBook({ title: "one", author_id: 3 });
    await insertTag({ name: "red" });
    await insertTag({ name: "blue" });
    await insertAuthorToTag({ author_id: 1, tag_id: 1 });
    await insertAuthorToTag({ author_id: 2, tag_id: 2 });
    await insertAuthorToTag({ author_id: 3, tag_id: 2 });
    const em = newEntityManager();
    resetQueryCount();
    // When callers require different book/tag combinations
    const results = await Promise.all([
      em.find(Author, { books: { title: "one" }, tags: { name: "red" } }),
      em.find(Author, { books: { title: "two" }, tags: { name: "blue" } }),
    ]);
    // Then matching an entry's book cannot substitute for matching its tag
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["first"], ["second"]]);
    expect(queries[0].includes("_cand AS MATERIALIZED")).toBe(true);
  });

  it("preserves shared OR branches inside a changing child predicate", async () => {
    // Given authors accepted by either a shared order or a varying title
    await insertAuthor({ first_name: "shared" });
    await insertAuthor({ first_name: "first" });
    await insertAuthor({ first_name: "second" });
    await insertBook({ title: "other", order: 1, author_id: 1 });
    await insertBook({ title: "one", order: 2, author_id: 2 });
    await insertBook({ title: "two", order: 2, author_id: 3 });
    const em = newEntityManager();
    const [b] = aliases(Book);
    resetQueryCount();
    // When a child's shared order is an alternative to its entry-specific title
    const results = await Promise.all(
      ["one", "two"].map((title) =>
        em.find(Author, { books: b }, { conditions: { or: [b.order.eq(1), b.title.eq(title)] } }),
      ),
    );
    // Then the shared branch is retained for each child and each entry
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([
      ["shared", "first"],
      ["shared", "second"],
    ]);
    expect(queries[0].includes("_cand AS MATERIALIZED")).toBe(true);
  });

  it("matches BETWEEN with one shared bound and one changing bound", async () => {
    // Given authors within and outside the requested age ranges
    for (const age of [25, 35, 45]) await insertAuthor({ first_name: `${age}`, age });
    for (const author_id of [1, 2, 3]) await insertBook({ title: "shared", author_id });
    const em = newEntityManager();
    resetQueryCount();
    // When callers share the upper bound but differ on the lower bound
    const results = await Promise.all(
      [20, 30].map((lower) => em.find(Author, { age: { between: [lower, 40] }, books: { title: "shared" } })),
    );
    // Then both bound slots retain their meaning in the per-entry predicate
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["25", "35"], ["35"]]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0, arg1) AS MATERIALIZED (SELECT unnest($1::int[]), unnest($2::int[]), unnest($3::int[])),  _cand AS MATERIALIZED (SELECT a AS _entity, a.age AS _c0, a.id AS _o0 FROM authors AS a WHERE a.deleted_at IS NULL AND a.age BETWEEN $4 AND $5 AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL AND b.title = $6)),  _matched AS MATERIALIZED (SELECT a._entity, a._o0, ARRAY(SELECT _find.tag FROM _find WHERE (a._c0 BETWEEN _find.arg0 AND _find.arg1)) AS _tags FROM _cand AS a) SELECT (a._entity).*, a._tags FROM _matched AS a WHERE cardinality(a._tags) > 0 ORDER BY a._o0 ASC LIMIT $7",
     ]
    `);
  });

  it("does not let cross-combinations consume the entity limit", async () => {
    // Given earlier authors whose books match only cross-combinations
    for (const first_name of ["cross1", "cross2", "first", "second"]) await insertAuthor({ first_name });
    await insertBook({ title: "one", order: 2, author_id: 1 });
    await insertBook({ title: "two", order: 1, author_id: 2 });
    // And two later genuine matches, below the entity limit of three
    await insertBook({ title: "one", order: 1, author_id: 3 });
    await insertBook({ title: "two", order: 2, author_id: 4 });
    const em = newEntityManager();
    em.entityLimit = 3;
    // When the batch contains correlated title/order pairs
    const results = await Promise.all([
      em.find(Author, { books: { title: "one", order: 1 } }),
      em.find(Author, { books: { title: "two", order: 2 } }),
    ]);
    // Then nonmatches cannot truncate the real results or trigger the entity limit
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["first"], ["second"]]);
  });

  it("preserves citext comparisons in projected child records", async () => {
    // Given an author whose tag is stored with different casing from the filter
    await insertAuthor({ first_name: "a1" });
    await insertTag({ name: "RED" });
    await insertAuthorToTag({ author_id: 1, tag_id: 1 });
    const em = newEntityManager();
    resetQueryCount();
    // When the exact-match phase checks negative membership using child records instead of scalar overlap
    const results = await Promise.all(
      ["red", "blue"].map((name) => em.find(Author, { tags: { name: { nin: [name] } } })),
    );
    // Then PostgreSQL's case-insensitive equality still excludes RED for the red entry
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([[], ["a1"]]);
    expect(queries[0].includes("_cand AS MATERIALIZED")).toBe(true);
  });

  it("returns only entity columns and tags from the exact-match phase", async () => {
    // Given an author matching one of two correlated title/order filters
    await insertAuthor({ first_name: "a1" });
    await insertBook({ title: "one", order: 1, author_id: 1 });
    // And an observer of the actual result columns delivered by the driver
    class ResultColumns extends Plugin {
      helpers: string[] = [];
      afterFind(_meta: unknown, operation: unknown, rows: RowData): void {
        if (operation === "find" && rows.rowCount > 0) {
          this.helpers = Object.keys(rows.toRow(0)).filter((name) => name.startsWith("_"));
        }
      }
    }
    const em = newEntityManager();
    const columns = new ResultColumns();
    em.addPlugin(columns);
    // When the exact-match phase needs SQL child-record arrays from the candidate phase
    await Promise.all([
      em.find(Author, { books: { title: "one", order: 1 } }),
      em.find(Author, { books: { title: "two", order: 2 } }),
    ]);
    // Then child-record arrays, the composite entity wrapper, and sort helpers never reach the client
    expect(columns.helpers).toEqual(["_tags"]);
  });

  it("uses nested membership without losing the review's parent book", async () => {
    // Given authors with different nested review ratings
    await insertAuthor({ first_name: "first" });
    await insertAuthor({ first_name: "second" });
    await insertBook({ title: "one", author_id: 1 });
    await insertBook({ title: "two", author_id: 2 });
    await insertBookReview({ book_id: 1, rating: 5 });
    await insertBookReview({ book_id: 2, rating: 3 });
    const em = newEntityManager();
    resetQueryCount();
    // When only the nested membership list changes
    const results = await Promise.all(
      [[5], [3, 5]].map((ratings) => em.find(Author, { books: { reviews: { rating: { in: ratings } } } })),
    );
    // Then each call's nested list matches only reviews belonging to that book record
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["first"], ["first", "second"]]);
    expect(queries[0].includes("_cand AS MATERIALIZED")).toBe(true);
  });

  it("does not repeat shared parameters for every call's candidate filter", async () => {
    // Given one author matches the first title/order pair
    await insertAuthor({ first_name: "a1", age: 30 });
    await insertBook({ title: "b0", order: 0, author_id: 1 });
    // And a shared bound condition would exceed 65,535 parameters if copied into all 66 OR branches
    const [a] = aliases(Author);
    const ageCondition = a.age.raw(`= ANY(ARRAY[${Array(1000).fill("?").join(", ")}]::int[])`, Array(1000).fill(30));
    const em = newEntityManager();
    resetQueryCount();
    // When both child values vary across the batch
    const results = await Promise.all(
      Array.from({ length: 66 }, (_, i) =>
        em.find(Author, { as: a, books: { title: `b${i}`, order: i } }, { conditions: { and: [ageCondition] } }),
      ),
    );
    // Then the shared condition fits within PostgreSQL's parameter limit
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual(
      Array.from({ length: 66 }, (_, i) => (i === 0 ? ["a1"] : [])),
    );
  });

  it("preserves a child column's non-default collation", async () => {
    // Given mentors whose mentees have lowercase titles and different book orders
    await insertAuthor({ first_name: "mentor1" });
    await insertAuthor({ first_name: "mentor2" });
    await insertAuthor({ first_name: "first", mentor_id: 1 });
    await insertAuthor({ first_name: "second", mentor_id: 2 });
    await insertBook({ title: "one", order: 1, author_id: 3 });
    await insertBook({ title: "two", order: 2, author_id: 4 });
    const em = newEntityManager();
    const rollback = new Error("Restore the fixture's title collation");

    // And a case-insensitive column collation, rolled back with the transaction after this test
    await em
      .transaction(async () => {
        await testDriver.driver.executeQuery(
          em,
          "CREATE COLLATION batch_title_ci (provider = icu, locale = 'und-u-ks-level2', deterministic = false)",
          [],
        );
        await testDriver.driver.executeQuery(
          em,
          "ALTER TABLE books ALTER COLUMN title TYPE character varying COLLATE batch_title_ci",
          [],
        );

        // When both title and order vary, forcing the exact-match phase to use typed child records
        const results = await Promise.all([
          em.find(Author, { books: { title: "ONE", order: 1 } }),
          em.find(Author, { books: { title: "TWO", order: 2 } }),
        ]);
        // Then projected column comparisons use the column's collation, not the database default
        expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["first"], ["second"]]);

        // When only a nested book title changes, it still needs the column's collation after unnesting
        const nested = await Promise.all(
          ["ONE", "TWO"].map((title) => em.find(Author, { mentees: { books: { title } } })),
        );

        // Then nested child-record arrays also retain the case-insensitive comparison
        expect(nested.map((rows) => rows.map((a) => a.firstName))).toEqual([["mentor1"], ["mentor2"]]);
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
  });

  it("keeps the same SQL text when more title/order pairs are batched", async () => {
    // Given one author with a matching title/order pair
    await insertAuthor({ first_name: "one" });
    await insertBook({ title: "one", order: 1, author_id: 1 });
    const em = newEntityManager();
    resetQueryCount();
    // When two different title/order filters are batched
    await Promise.all([
      em.find(Author, { books: { title: "one", order: 1 } }),
      em.find(Author, { books: { title: "two", order: 2 } }),
    ]);
    const twoCallsSql = queries[0];
    // Then the candidate phase uses independent value lists, while the exact-match phase retains each call's pair
    expect(twoCallsSql).toMatchInlineSnapshot(
      `"WITH _find (tag, arg0, arg1) AS MATERIALIZED (SELECT unnest($1::int[]), unnest_arrays($2::character varying[][]), unnest_arrays($3::int[][])),  _cand AS MATERIALIZED (SELECT a AS _entity, ARRAY(SELECT ROW(b) FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL) AS _c0, a.id AS _o0 FROM authors AS a WHERE a.deleted_at IS NULL AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL AND b.title = ANY($4) AND b."order" = ANY($5))),  _matched AS MATERIALIZED (SELECT a._entity, a._o0, ARRAY(SELECT _find.tag FROM _find WHERE (EXISTS (SELECT 1 FROM unnest(a._c0) AS _r0(_c0 books) WHERE ((_r0._c0).title = ANY(_find.arg0) AND (_r0._c0)."order" = ANY(_find.arg1))))) AS _tags FROM _cand AS a) SELECT (a._entity).*, a._tags FROM _matched AS a WHERE cardinality(a._tags) > 0 ORDER BY a._o0 ASC LIMIT $6"`,
    );

    // When a fresh EntityManager batches three title/order filters
    const em2 = newEntityManager();
    resetQueryCount();
    await Promise.all([
      em2.find(Author, { books: { title: "one", order: 1 } }),
      em2.find(Author, { books: { title: "two", order: 2 } }),
      em2.find(Author, { books: { title: "three", order: 3 } }),
    ]);
    // Then only the bindings change, not the SQL text
    expect(queries).toEqual([twoCallsSql]);
  });

  it("uses the highest numeric upper bound to select candidates", async () => {
    // Given authors on either side of two age thresholds, each with a matching book
    for (const age of [20, 30, 40]) await insertAuthor({ first_name: `${age}`, age });
    for (const author_id of [1, 2, 3]) await insertBook({ title: "shared", author_id });
    const em = newEntityManager();
    resetQueryCount();
    // When callers request different strict upper bounds
    const results = await Promise.all(
      [30, 40].map((age) => em.find(Author, { age: { lt: age }, books: { title: "shared" } })),
    );
    // Then the candidate phase uses age < 40 and the exact-match phase enforces each call's bound
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["20"], ["20", "30"]]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0) AS MATERIALIZED (SELECT unnest($1::int[]), unnest($2::int[])),  _cand AS MATERIALIZED (SELECT a AS _entity, a.age AS _c0, a.id AS _o0 FROM authors AS a WHERE a.deleted_at IS NULL AND a.age < $3 AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL AND b.title = $4)),  _matched AS MATERIALIZED (SELECT a._entity, a._o0, ARRAY(SELECT _find.tag FROM _find WHERE (a._c0 < _find.arg0)) AS _tags FROM _cand AS a) SELECT (a._entity).*, a._tags FROM _matched AS a WHERE cardinality(a._tags) > 0 ORDER BY a._o0 ASC LIMIT $5",
     ]
    `);
  });

  it("leaves text range comparisons to the exact-match phase", async () => {
    // Given authors whose book titles sort on either side of the requested thresholds
    for (const first_name of ["a", "m", "z"]) await insertAuthor({ first_name });
    await insertBook({ title: "a", author_id: 1 });
    await insertBook({ title: "m", author_id: 2 });
    await insertBook({ title: "z", author_id: 3 });
    const em = newEntityManager();
    resetQueryCount();
    // When callers use different text thresholds whose ordering belongs to PostgreSQL
    const results = await Promise.all(["a", "m"].map((title) => em.find(Author, { books: { title: { gt: title } } })));
    // Then broad candidates include all books and PostgreSQL applies each exact comparison
    expect(results.map((rows) => rows.map((a) => a.firstName))).toEqual([["m", "z"], ["z"]]);
    expect(queries).toMatchInlineSnapshot(`
     [
       "WITH _find (tag, arg0) AS MATERIALIZED (SELECT unnest($1::int[]), unnest($2::character varying[])),  _cand AS MATERIALIZED (SELECT a AS _entity, ARRAY(SELECT ROW(b) FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL) AS _c0, a.id AS _o0 FROM authors AS a WHERE a.deleted_at IS NULL AND EXISTS (SELECT 1 FROM books AS b WHERE a.id = b.author_id AND b.deleted_at IS NULL AND TRUE)),  _matched AS MATERIALIZED (SELECT a._entity, a._o0, ARRAY(SELECT _find.tag FROM _find WHERE (EXISTS (SELECT 1 FROM unnest(a._c0) AS _r0(_c0 books) WHERE ((_r0._c0).title > _find.arg0)))) AS _tags FROM _cand AS a) SELECT (a._entity).*, a._tags FROM _matched AS a WHERE cardinality(a._tags) > 0 ORDER BY a._o0 ASC LIMIT $3",
     ]
    `);
  });
});
