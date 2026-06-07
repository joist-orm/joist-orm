import { paginateCursor, paginateLimit } from "joist-graphql-resolver-utils";
import { Author, Color, Comment, FavoriteShape, newAuthor, newComment, newSmallPublisher } from "src/entities";

describe("pagination resolvers", () => {
  it.withCtx("pipes primitive filters through paginateLimit", async (ctx) => {
    newAuthor(ctx.em, { firstName: "primitive match" });
    newAuthor(ctx.em, { firstName: "primitive miss" });
    await ctx.em.flush();

    const page = await paginateLimit(ctx, Author, { filter: { firstName: "primitive match" } });

    expect(page.entities.map((a) => a.firstName)).toEqual(["primitive match"]);
    await expect(page.pageInfo.totalCount).resolves.toEqual(1);
  });

  it.withCtx("pipes enum filters through paginateLimit", async (ctx) => {
    newAuthor(ctx.em, { favoriteColors: [Color.Red], favoriteShape: FavoriteShape.Circle, firstName: "enum match" });
    newAuthor(ctx.em, { favoriteColors: [Color.Blue], favoriteShape: FavoriteShape.Square, firstName: "enum miss" });
    await ctx.em.flush();

    const page = await paginateLimit(ctx, Author, { filter: { favoriteShape: FavoriteShape.Circle } });

    expect(page.entities.map((a) => a.firstName)).toEqual(["enum match"]);
    await expect(page.pageInfo.totalCount).resolves.toEqual(1);
  });

  it.withCtx("pipes many-to-one filters through paginateLimit", async (ctx) => {
    const publisher = newSmallPublisher(ctx.em, { name: "publisher match" });
    newAuthor(ctx.em, { firstName: "m2o match", publisher });
    newAuthor(ctx.em, { firstName: "m2o miss", publisher: {} });
    await ctx.em.flush();

    const page = await paginateLimit(ctx, Author, { filter: { publisherId: publisher.id } });

    expect(page.entities.map((a) => a.firstName)).toEqual(["m2o match"]);
    await expect(page.pageInfo.totalCount).resolves.toEqual(1);
  });

  it.withCtx("pipes polymorphic filters through paginateLimit", async (ctx) => {
    const author = newAuthor(ctx.em, { firstName: "poly author" });
    newComment(ctx.em, { parent: author, text: "poly match" });
    newComment(ctx.em, { parent: newSmallPublisher(ctx.em, { name: "poly publisher" }), text: "poly miss" });
    await ctx.em.flush();

    const page = await paginateLimit(ctx, Comment, { filter: { parentId: author.id } });

    expect(page.entities.map((c) => c.text)).toEqual(["poly match"]);
    await expect(page.pageInfo.totalCount).resolves.toEqual(1);
  });

  it.withCtx("pipes primitive filters through paginateCursor", async (ctx) => {
    newAuthor(ctx.em, { firstName: "cursor primitive match" });
    newAuthor(ctx.em, { firstName: "cursor primitive miss" });
    await ctx.em.flush();

    const page = await paginateCursor(ctx, Author, { filter: { firstName: "cursor primitive match" }, first: 10 });

    expect(page.nodes.map((a) => a.firstName)).toEqual(["cursor primitive match"]);
    expect(page.edges.map((e) => e.node.firstName)).toEqual(["cursor primitive match"]);
  });

  it.withCtx("pipes enum filters through paginateCursor", async (ctx) => {
    newAuthor(ctx.em, {
      favoriteColors: [Color.Red],
      favoriteShape: FavoriteShape.Circle,
      firstName: "cursor enum match",
    });
    newAuthor(ctx.em, {
      favoriteColors: [Color.Blue],
      favoriteShape: FavoriteShape.Square,
      firstName: "cursor enum miss",
    });
    await ctx.em.flush();

    const page = await paginateCursor(ctx, Author, { filter: { favoriteShape: FavoriteShape.Circle }, first: 10 });

    expect(page.nodes.map((a) => a.firstName)).toEqual(["cursor enum match"]);
  });

  it.withCtx("pipes many-to-one filters through paginateCursor", async (ctx) => {
    const publisher = newSmallPublisher(ctx.em, { name: "cursor publisher match" });
    newAuthor(ctx.em, { firstName: "cursor m2o match", publisher });
    newAuthor(ctx.em, { firstName: "cursor m2o miss", publisher: {} });
    await ctx.em.flush();

    const page = await paginateCursor(ctx, Author, { filter: { publisherId: publisher.id }, first: 10 });

    expect(page.nodes.map((a) => a.firstName)).toEqual(["cursor m2o match"]);
  });

  it.withCtx("pipes polymorphic filters through paginateCursor", async (ctx) => {
    const author = newAuthor(ctx.em, { firstName: "cursor poly author" });
    newComment(ctx.em, { parent: author, text: "cursor poly match" });
    newComment(ctx.em, {
      parent: newSmallPublisher(ctx.em, { name: "cursor poly publisher" }),
      text: "cursor poly miss",
    });
    await ctx.em.flush();

    const page = await paginateCursor(ctx, Comment, { filter: { parentId: author.id }, first: 10 });

    expect(page.nodes.map((c) => c.text)).toEqual(["cursor poly match"]);
  });
});
