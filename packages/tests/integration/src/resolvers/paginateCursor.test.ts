import { expectTypeOf } from "expect-type";
import { paginateCursor } from "joist-graphql-resolver-utils";
import { type Query, tables } from "joist-orm";
import { Author, Book, Color, Comment, FavoriteShape, newAuthor, newComment, newSmallPublisher } from "src/entities";
import { insertAuthor, insertBook } from "src/entities/inserts";
import { numberOfQueries, resetQueryCount } from "src/testEm";

describe("paginateCursor", () => {
  it.withCtx("pipes primitive filters through paginateCursor", async (ctx) => {
    // Given an Author with the requested first name
    newAuthor(ctx.em, { firstName: "cursor primitive match" });
    // And an Author with a different first name
    newAuthor(ctx.em, { firstName: "cursor primitive miss" });
    await ctx.em.flush();

    // When requesting Authors with the matching first name
    const page = await paginateCursor(ctx, Author, { filter: { firstName: "cursor primitive match" }, first: 10 });

    // Then only the matching Author appears in the nodes and edges
    expect(page.nodes.map((a) => a.firstName)).toEqual(["cursor primitive match"]);
    expect(page.edges.map((e) => e.node.firstName)).toEqual(["cursor primitive match"]);
  });

  it.withCtx("pipes enum filters through paginateCursor", async (ctx) => {
    // Given an Author whose favorite shape is Circle
    newAuthor(ctx.em, {
      favoriteColors: [Color.Red],
      favoriteShape: FavoriteShape.Circle,
      firstName: "cursor enum match",
    });
    // And an Author whose favorite shape is Square
    newAuthor(ctx.em, {
      favoriteColors: [Color.Blue],
      favoriteShape: FavoriteShape.Square,
      firstName: "cursor enum miss",
    });
    await ctx.em.flush();

    // When requesting Authors whose favorite shape is Circle
    const page = await paginateCursor(ctx, Author, { filter: { favoriteShape: FavoriteShape.Circle }, first: 10 });

    // Then only the Author who favors Circle is returned
    expect(page.nodes.map((a) => a.firstName)).toEqual(["cursor enum match"]);
  });

  it.withCtx("pipes many-to-one filters through paginateCursor", async (ctx) => {
    // Given a SmallPublisher
    const publisher = newSmallPublisher(ctx.em, { name: "cursor publisher match" });
    // And an Author at that SmallPublisher
    newAuthor(ctx.em, { firstName: "cursor m2o match", publisher });
    // And an Author at another Publisher
    newAuthor(ctx.em, { firstName: "cursor m2o miss", publisher: {} });
    await ctx.em.flush();

    // When requesting Authors by the SmallPublisher's ID
    const page = await paginateCursor(ctx, Author, { filter: { publisherId: publisher.id }, first: 10 });

    // Then only the Author at that SmallPublisher is returned
    expect(page.nodes.map((a) => a.firstName)).toEqual(["cursor m2o match"]);
  });

  it.withCtx("pipes polymorphic filters through paginateCursor", async (ctx) => {
    // Given an Author
    const author = newAuthor(ctx.em, { firstName: "cursor poly author" });
    // And a Comment whose parent is that Author
    newComment(ctx.em, { parent: author, text: "cursor poly match" });
    // And a Comment whose parent is a SmallPublisher instead
    newComment(ctx.em, {
      parent: newSmallPublisher(ctx.em, { name: "cursor poly publisher" }),
      text: "cursor poly miss",
    });
    await ctx.em.flush();

    // When requesting Comments by the Author's parent ID
    const page = await paginateCursor(ctx, Comment, { filter: { parentId: author.id }, first: 10 });

    // Then only the Comment on the Author is returned
    expect(page.nodes.map((c) => c.text)).toEqual(["cursor poly match"]);
  });

  it.withCtx("pages forward by ID instead of the query's order and pagination", async (ctx) => {
    // Given Authors whose name order differs from their ID order
    await insertAuthor({ first_name: "Charlie" });
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob" });
    // And a query whose order and pagination differ from cursor pagination
    const [a] = tables(Author);
    const query = { from: a, select: a, orderBy: { first_name: "ASC" }, limit: 1, offset: 20 } satisfies Query;

    // When requesting the first two Authors
    const first = await paginateCursor(ctx, query, { first: 2 });

    // Then entities and edges follow ascending IDs with cursors for their endpoints
    expectTypeOf(first.nodes).toEqualTypeOf<Author[]>();
    expectTypeOf(first.edges[0].node).toEqualTypeOf<Author>();
    expect(first.nodes.map((author) => author.firstName)).toEqual(["Charlie", "Alice"]);
    expect(first.edges.map((edge) => edge.node)).toEqual(first.nodes);
    expect(first.edges.map((edge) => Buffer.from(edge.cursor, "base64").toString("utf8"))).toEqual(["a:1", "a:2"]);
    expect(first.pageInfo.startCursor).toEqual(first.edges[0].cursor);
    expect(first.pageInfo.endCursor).toEqual(first.edges[1].cursor);
    await expect(first.pageInfo.hasPreviousPage).resolves.toEqual(false);
    await expect(first.pageInfo.hasNextPage).resolves.toEqual(true);
    await expect(first.pageInfo.totalCount).resolves.toEqual(3);

    // When continuing after the first page's end cursor
    const last = await paginateCursor(ctx, query, { first: 2, after: first.pageInfo.endCursor });

    // Then the last Author is returned without reducing the total count to the cursor window
    expect(last.nodes.map((author) => author.firstName)).toEqual(["Bob"]);
    await expect(last.pageInfo.hasPreviousPage).resolves.toEqual(true);
    await expect(last.pageInfo.hasNextPage).resolves.toEqual(false);
    await expect(last.pageInfo.totalCount).resolves.toEqual(3);

    // When continuing past the last Author
    const empty = await paginateCursor(ctx, query, { first: 2, after: last.pageInfo.endCursor });

    // Then empty connections have no endpoints or adjacent pages under the existing page-info contract
    expect(empty.nodes).toEqual([]);
    expect(empty.edges).toEqual([]);
    expect(empty.pageInfo.startCursor).toBeUndefined();
    expect(empty.pageInfo.endCursor).toBeUndefined();
    await expect(empty.pageInfo.hasPreviousPage).resolves.toEqual(false);
    await expect(empty.pageInfo.hasNextPage).resolves.toEqual(false);
    await expect(empty.pageInfo.totalCount).resolves.toEqual(3);
    expect(query.orderBy).toEqual({ first_name: "ASC" });
    expect(query.limit).toEqual(1);
    expect(query.offset).toEqual(20);
  });

  it.withCtx("selects backward pages by descending ID and returns them in ascending order", async (ctx) => {
    // Given four Authors in ID order
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob" });
    await insertAuthor({ first_name: "Charlie" });
    await insertAuthor({ first_name: "Diana" });
    // And an Author query ordered by name instead of ID
    const [a] = tables(Author);
    const query = { from: a, select: a, orderBy: { first_name: "ASC" } } satisfies Query;

    // When requesting the last two Authors
    const last = await paginateCursor(ctx, query, { last: 2 });

    // Then the highest IDs are returned in ascending order with matching edge endpoints
    expect(last.nodes.map((author) => author.firstName)).toEqual(["Charlie", "Diana"]);
    expect(last.edges.map((edge) => edge.node)).toEqual(last.nodes);
    expect(last.pageInfo.startCursor).toEqual(last.edges[0].cursor);
    expect(last.pageInfo.endCursor).toEqual(last.edges[1].cursor);
    await expect(last.pageInfo.hasPreviousPage).resolves.toEqual(true);
    await expect(last.pageInfo.hasNextPage).resolves.toEqual(false);
    await expect(last.pageInfo.totalCount).resolves.toEqual(4);

    // When requesting the preceding page before Charlie
    const first = await paginateCursor(ctx, query, { last: 2, before: last.pageInfo.startCursor });

    // Then the first two Authors are returned in ascending order
    expect(first.nodes.map((author) => author.firstName)).toEqual(["Alice", "Bob"]);
    await expect(first.pageInfo.hasPreviousPage).resolves.toEqual(false);
    await expect(first.pageInfo.hasNextPage).resolves.toEqual(true);
    await expect(first.pageInfo.totalCount).resolves.toEqual(4);

    // When requesting Authors before the first Author
    const empty = await paginateCursor(ctx, query, { last: 2, before: first.pageInfo.startCursor });

    // Then the backward connection is empty but retains the unpaginated count
    expect(empty.nodes).toEqual([]);
    expect(empty.edges).toEqual([]);
    expect(empty.pageInfo.startCursor).toBeUndefined();
    expect(empty.pageInfo.endCursor).toBeUndefined();
    await expect(empty.pageInfo.hasPreviousPage).resolves.toEqual(false);
    await expect(empty.pageInfo.hasNextPage).resolves.toEqual(false);
    await expect(empty.pageInfo.totalCount).resolves.toEqual(4);
  });

  it.withCtx("ANDs both cursor bounds with existing ID and name conditions", async (ctx) => {
    // Given Authors inside and outside the requested cursor window
    for (let id = 1; id <= 7; id++) {
      await insertAuthor({ first_name: id === 4 ? "excluded" : "included" });
    }
    // And a base query that excludes an interior ID and an interior name
    const [a] = tables(Author);
    const where = { and: [a.id.ne("a:3"), a.first_name.eq("included")] };
    const query = { from: a, select: a, where } satisfies Query;
    // And cursor bounds that exclude the first and last Authors
    const after = Buffer.from("a:1").toString("base64");
    const before = Buffer.from("a:7").toString("base64");

    // When requesting the bounded Authors in both directions
    const forward = await paginateCursor(ctx, query, { first: 10, after, before });
    const backward = await paginateCursor(ctx, query, { last: 10, after, before });

    // Then both bounds and both base conditions apply without mutating the base query
    expect(forward.nodes.map((author) => author.id)).toEqual(["a:2", "a:5", "a:6"]);
    expect(backward.nodes.map((author) => author.id)).toEqual(["a:2", "a:5", "a:6"]);
    expect(query.where).toBe(where);
    await expect(forward.pageInfo.totalCount).resolves.toEqual(5);
    await expect(backward.pageInfo.totalCount).resolves.toEqual(5);
    await expect(forward.pageInfo.hasPreviousPage).resolves.toEqual(true);
    await expect(forward.pageInfo.hasNextPage).resolves.toEqual(true);
  });

  it.withCtx("counts distinct joined Authors rather than their Books", async (ctx) => {
    // Given an Author with two Books and another Author with one Book
    await insertAuthor({ first_name: "Alice" });
    await insertBook({ title: "Alice's first", author_id: 1 });
    await insertBook({ title: "Alice's second", author_id: 1 });
    await insertAuthor({ first_name: "Bob" });
    await insertBook({ title: "Bob's first", author_id: 2 });
    // And an Author without Books who must not appear in the count
    await insertAuthor({ first_name: "Charlie" });
    // And a distinct Author query with a pinned Book join and pagination that must be removed for counting
    const [a, b] = tables(Author, Book);
    const query = {
      from: a,
      select: a,
      join: [{ inner: b, on: b.author_id.eq(a.id), keep: true }],
      distinct: true,
      orderBy: { id: "ASC" },
      limit: 1,
      offset: 10,
    } satisfies Query;

    // When requesting the first distinct Author
    const cursor = await paginateCursor(ctx, query, { first: 1 });

    // Then the page contains Alice and counts two Authors rather than three joined rows
    expect(cursor.nodes.map((author) => author.firstName)).toEqual(["Alice"]);
    await expect(cursor.pageInfo.totalCount).resolves.toEqual(2);
    await expect(cursor.pageInfo.hasPreviousPage).resolves.toEqual(false);
    await expect(cursor.pageInfo.hasNextPage).resolves.toEqual(true);
  });

  it.withCtx("prunes joins referenced only by the query's replaced ordering", async (ctx) => {
    // Given Alice with two Books and Bob without Books
    await insertAuthor({ first_name: "Alice" });
    await insertBook({ title: "First", author_id: 1 });
    await insertBook({ title: "Second", author_id: 1 });
    await insertAuthor({ first_name: "Bob" });
    // And Charlie without Books, so pruning the Book join would count three instead of two rows
    await insertAuthor({ first_name: "Charlie" });
    // And an Author query whose Book join is retained only by its ordering
    const [a, b] = tables(Author, Book);
    const query = {
      from: a,
      select: a,
      join: [{ inner: b, on: b.author_id.eq(a.id) }],
      orderBy: [{ asc: b.title }],
    } satisfies Query;

    // When cursor pagination replaces Book ordering with Author ID ordering
    const cursor = await paginateCursor(ctx, query, { first: 2 });

    // Then the now-unused Book join is pruned consistently for nodes and page info
    expect(cursor.nodes.map((author) => author.firstName)).toEqual(["Alice", "Bob"]);
    await expect(cursor.pageInfo.totalCount).resolves.toEqual(3);
    await expect(cursor.pageInfo.hasNextPage).resolves.toEqual(true);
  });

  it.withCtx("counts Author groups that satisfy having instead of joined Books", async (ctx) => {
    // Given two Authors with multiple Books
    await insertAuthor({ first_name: "Alice" });
    await insertBook({ title: "Alice's first", author_id: 1 });
    await insertBook({ title: "Alice's second", author_id: 1 });
    await insertAuthor({ first_name: "Bob" });
    await insertBook({ title: "Bob's first", author_id: 2 });
    await insertBook({ title: "Bob's second", author_id: 2 });
    await insertBook({ title: "Bob's third", author_id: 2 });
    // And an Author with only one Book who fails the having condition
    await insertAuthor({ first_name: "Charlie" });
    await insertBook({ title: "Charlie's first", author_id: 3 });
    // And a grouped Author query with pagination that must not affect the count
    const [a, b] = tables(Author, Book);
    const query = {
      from: a,
      select: a,
      join: [{ inner: b, on: b.author_id.eq(a.id) }],
      groupBy: [a.id],
      having: b.id.count().gt(1),
      orderBy: { id: "ASC" },
      limit: 1,
      offset: 10,
    } satisfies Query;

    // When requesting the last qualifying Author
    const cursor = await paginateCursor(ctx, query, { last: 1 });

    // Then Bob is returned and the count includes only the two qualifying Author groups
    expect(cursor.nodes.map((author) => author.firstName)).toEqual(["Bob"]);
    await expect(cursor.pageInfo.totalCount).resolves.toEqual(2);
    await expect(cursor.pageInfo.hasPreviousPage).resolves.toEqual(true);
    await expect(cursor.pageInfo.hasNextPage).resolves.toEqual(false);
  });

  it.withCtx("lazily memoizes each cursor page-info count", async (ctx) => {
    // Given three Authors and a query for the middle Author's page
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob" });
    await insertAuthor({ first_name: "Charlie" });
    const [a] = tables(Author);
    const query = { from: a, select: a } satisfies Query;
    // And query recording that excludes Author setup
    resetQueryCount();

    // When fetching Bob's page without requesting any counts
    const page = await paginateCursor(ctx, query, { first: 1, after: Buffer.from("a:1").toString("base64") });

    // Then the nodes, edges, and endpoints need only the entity query
    expect(page.nodes.map((author) => author.firstName)).toEqual(["Bob"]);
    expect(page.edges[0].node).toBe(page.nodes[0]);
    expect(page.pageInfo.startCursor).toEqual(page.edges[0].cursor);
    expect(page.pageInfo.endCursor).toEqual(page.edges[0].cursor);
    expect(numberOfQueries).toEqual(1);

    // When requesting all three count fields while their queries are pending
    const totalCount = page.pageInfo.totalCount;
    const hasPreviousPage = page.pageInfo.hasPreviousPage;
    const hasNextPage = page.pageInfo.hasNextPage;

    // Then each field memoizes its own promise and executes only one count query
    expect(page.pageInfo.totalCount).toBe(totalCount);
    expect(page.pageInfo.hasPreviousPage).toBe(hasPreviousPage);
    expect(page.pageInfo.hasNextPage).toBe(hasNextPage);
    await expect(totalCount).resolves.toEqual(3);
    await expect(hasPreviousPage).resolves.toEqual(true);
    await expect(hasNextPage).resolves.toEqual(true);
    await expect(page.pageInfo.totalCount).resolves.toEqual(3);
    await expect(page.pageInfo.hasPreviousPage).resolves.toEqual(true);
    await expect(page.pageInfo.hasNextPage).resolves.toEqual(true);
    expect(numberOfQueries).toEqual(4);
  });
});
