import { expectTypeOf } from "expect-type";
import { paginateLimit } from "joist-graphql-resolver-utils";
import { type Query, tables } from "joist-orm";
import { Author, Book, Color, Comment, FavoriteShape, newAuthor, newComment, newSmallPublisher } from "src/entities";
import { insertAuthor, insertBook } from "src/entities/inserts";
import { numberOfQueries, resetQueryCount } from "src/testEm";

describe("paginateLimit", () => {
  it.withCtx("pipes primitive filters through paginateLimit", async (ctx) => {
    // Given an Author with the requested first name
    newAuthor(ctx.em, { firstName: "primitive match" });
    // And an Author with a different first name
    newAuthor(ctx.em, { firstName: "primitive miss" });
    await ctx.em.flush();

    // When requesting Authors with the matching first name
    const page = await paginateLimit(ctx, Author, { filter: { firstName: "primitive match" } });

    // Then only the matching Author is returned and counted
    expect(page.entities.map((a) => a.firstName)).toEqual(["primitive match"]);
    await expect(page.pageInfo.totalCount).resolves.toEqual(1);
  });

  it.withCtx("pipes enum filters through paginateLimit", async (ctx) => {
    // Given an Author whose favorite shape is Circle
    newAuthor(ctx.em, { favoriteColors: [Color.Red], favoriteShape: FavoriteShape.Circle, firstName: "enum match" });
    // And an Author whose favorite shape is Square
    newAuthor(ctx.em, { favoriteColors: [Color.Blue], favoriteShape: FavoriteShape.Square, firstName: "enum miss" });
    await ctx.em.flush();

    // When requesting Authors whose favorite shape is Circle
    const page = await paginateLimit(ctx, Author, { filter: { favoriteShape: FavoriteShape.Circle } });

    // Then only the Author who favors Circle is returned and counted
    expect(page.entities.map((a) => a.firstName)).toEqual(["enum match"]);
    await expect(page.pageInfo.totalCount).resolves.toEqual(1);
  });

  it.withCtx("pipes many-to-one filters through paginateLimit", async (ctx) => {
    // Given a SmallPublisher
    const publisher = newSmallPublisher(ctx.em, { name: "publisher match" });
    // And an Author at that SmallPublisher
    newAuthor(ctx.em, { firstName: "m2o match", publisher });
    // And an Author at another Publisher
    newAuthor(ctx.em, { firstName: "m2o miss", publisher: {} });
    await ctx.em.flush();

    // When requesting Authors by the SmallPublisher's ID
    const page = await paginateLimit(ctx, Author, { filter: { publisherId: publisher.id } });

    // Then only the Author at that SmallPublisher is returned and counted
    expect(page.entities.map((a) => a.firstName)).toEqual(["m2o match"]);
    await expect(page.pageInfo.totalCount).resolves.toEqual(1);
  });

  it.withCtx("pipes polymorphic filters through paginateLimit", async (ctx) => {
    // Given an Author
    const author = newAuthor(ctx.em, { firstName: "poly author" });
    // And a Comment whose parent is that Author
    newComment(ctx.em, { parent: author, text: "poly match" });
    // And a Comment whose parent is a SmallPublisher instead
    newComment(ctx.em, { parent: newSmallPublisher(ctx.em, { name: "poly publisher" }), text: "poly miss" });
    await ctx.em.flush();

    // When requesting Comments by the Author's parent ID
    const page = await paginateLimit(ctx, Comment, { filter: { parentId: author.id } });

    // Then only the Comment on the Author is returned and counted
    expect(page.entities.map((c) => c.text)).toEqual(["poly match"]);
    await expect(page.pageInfo.totalCount).resolves.toEqual(1);
  });

  it.withCtx("preserves limit query ordering and replaces its limit and offset", async (ctx) => {
    // Given Authors whose name order differs from their ID order
    await insertAuthor({ first_name: "Charlie" });
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob" });
    // And a name-ordered query with pagination that must not constrain the requested pages or count
    const [a] = tables(Author);
    const query = { from: a, select: a, orderBy: { first_name: "ASC" }, limit: 1, offset: 20 } satisfies Query;

    // When requesting the first two Authors by name
    const first = await paginateLimit(ctx, query, { limit: 2 });

    // Then the requested limit and default offset replace the query's pagination
    expectTypeOf(first.entities).toEqualTypeOf<Author[]>();
    expect(first.entities.map((author) => author.firstName)).toEqual(["Alice", "Bob"]);
    expect(first.entities[0]).toBe(await ctx.em.load(Author, "a:2"));
    expect(first.pageInfo.currentPage).toEqual(1);
    expect(first.pageInfo.hasPreviousPage).toEqual(false);
    await expect(first.pageInfo.hasNextPage).resolves.toEqual(true);
    await expect(first.pageInfo.nextPage).resolves.toEqual(2);
    await expect(first.pageInfo.totalCount).resolves.toEqual(3);

    // When requesting the last partial page
    const last = await paginateLimit(ctx, query, { limit: 2, offset: 2 });

    // Then only the final Author remains and there is no next page
    expect(last.entities.map((author) => author.firstName)).toEqual(["Charlie"]);
    expect(last.pageInfo.currentPage).toEqual(2);
    expect(last.pageInfo.hasPreviousPage).toEqual(true);
    await expect(last.pageInfo.hasNextPage).resolves.toEqual(false);
    await expect(last.pageInfo.nextPage).resolves.toBeUndefined();
    await expect(last.pageInfo.totalCount).resolves.toEqual(3);

    // When requesting a page beyond all Authors
    const empty = await paginateLimit(ctx, query, { limit: 2, offset: 4 });

    // Then the empty page still counts every Author in the unpaginated query
    expect(empty.entities).toEqual([]);
    expect(empty.pageInfo.currentPage).toEqual(3);
    expect(empty.pageInfo.hasPreviousPage).toEqual(true);
    await expect(empty.pageInfo.hasNextPage).resolves.toEqual(false);
    await expect(empty.pageInfo.nextPage).resolves.toBeUndefined();
    await expect(empty.pageInfo.totalCount).resolves.toEqual(3);
    expect(query.limit).toEqual(1);
    expect(query.offset).toEqual(20);
    expect(query.orderBy).toEqual({ first_name: "ASC" });
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
    const limit = await paginateLimit(ctx, query, { limit: 1 });

    // Then the page contains Alice and counts two Authors rather than three joined rows
    expect(limit.entities.map((author) => author.firstName)).toEqual(["Alice"]);
    await expect(limit.pageInfo.totalCount).resolves.toEqual(2);
  });

  it.withCtx("preserves joins referenced only by limit ordering when counting", async (ctx) => {
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

    // When requesting Authors in Book title order
    const limit = await paginateLimit(ctx, query, { limit: 1 });

    // Then the total counts joined rows rather than all Authors
    expect(limit.entities.map((author) => author.firstName)).toEqual(["Alice"]);
    await expect(limit.pageInfo.totalCount).resolves.toEqual(2);
    await expect(limit.pageInfo.hasNextPage).resolves.toEqual(true);
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
    const limit = await paginateLimit(ctx, query, { limit: 1, offset: 1 });

    // Then Bob is returned and the count includes only the two qualifying Author groups
    expect(limit.entities.map((author) => author.firstName)).toEqual(["Bob"]);
    await expect(limit.pageInfo.totalCount).resolves.toEqual(2);
    await expect(limit.pageInfo.hasNextPage).resolves.toEqual(false);
  });

  it.withCtx("lazily memoizes the limit count shared by page-info fields", async (ctx) => {
    // Given two Authors and a query for the first Author's page
    await insertAuthor({ first_name: "Alice" });
    await insertAuthor({ first_name: "Bob" });
    const [a] = tables(Author);
    const query = { from: a, select: a, orderBy: { id: "ASC" } } satisfies Query;
    // And query recording that excludes Author setup
    resetQueryCount();

    // When fetching only the first page and its synchronous page-info fields
    const page = await paginateLimit(ctx, query, { limit: 1 });

    // Then only the entity query has executed
    expect(page.entities.map((author) => author.firstName)).toEqual(["Alice"]);
    expect(page.pageInfo.currentPage).toEqual(1);
    expect(page.pageInfo.hasPreviousPage).toEqual(false);
    expect(numberOfQueries).toEqual(1);

    // When reading count-dependent fields while the count is pending
    const totalCount = page.pageInfo.totalCount;
    const hasNextPage = page.pageInfo.hasNextPage;
    const nextPage = page.pageInfo.nextPage;

    // Then all fields share one count query and reuse it after completion
    expect(page.pageInfo.totalCount).toBe(totalCount);
    await expect(totalCount).resolves.toEqual(2);
    await expect(hasNextPage).resolves.toEqual(true);
    await expect(nextPage).resolves.toEqual(2);
    await expect(page.pageInfo.totalCount).resolves.toEqual(2);
    await expect(page.pageInfo.hasNextPage).resolves.toEqual(true);
    await expect(page.pageInfo.nextPage).resolves.toEqual(2);
    expect(numberOfQueries).toEqual(2);
  });
});
