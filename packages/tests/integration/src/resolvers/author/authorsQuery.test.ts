import { newAuthor, newSmallPublisher } from "src/entities";
import { authors } from "src/resolvers/author/authorsQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("authors", () => {
  it.withCtx("returns a limit page", async (ctx) => {
    newAuthor(ctx.em, { firstName: "basic 1" });
    newAuthor(ctx.em, { firstName: "basic 2" });
    await ctx.em.flush();

    const result = await run(ctx, { limit: 1, offset: 0 });

    expect(result.entities.map((a) => a.firstName)).toEqual(["basic 1"]);
    expect(result.pageInfo.hasPreviousPage).toEqual(false);
    expect(result.pageInfo.currentPage).toEqual(1);
    await expect(result.pageInfo.hasNextPage).resolves.toEqual(true);
    await expect(result.pageInfo.nextPage).resolves.toEqual(2);
    await expect(result.pageInfo.totalCount).resolves.toEqual(2);
  });

  it.withCtx("filters by primitive fields", async (ctx) => {
    newAuthor(ctx.em, { firstName: "primitive query match" });
    newAuthor(ctx.em, { firstName: "primitive query miss" });
    await ctx.em.flush();

    const result = await run(ctx, { filter: { firstName: "primitive query match" }, limit: 10 });

    expect(result.entities.map((a) => a.firstName)).toEqual(["primitive query match"]);
    await expect(result.pageInfo.totalCount).resolves.toEqual(1);
  });

  it.withCtx("filters by many-to-one id aliases", async (ctx) => {
    const publisher = newSmallPublisher(ctx.em, { name: "authors query publisher" });
    newAuthor(ctx.em, { firstName: "publisher query match", publisher });
    newAuthor(ctx.em, { firstName: "publisher query miss", publisher: {} });
    await ctx.em.flush();

    const result = await run(ctx, { filter: { publisherId: publisher.id }, limit: 10 });

    expect(result.entities.map((a) => a.firstName)).toEqual(["publisher query match"]);
    await expect(result.pageInfo.totalCount).resolves.toEqual(1);
  });
});

const run = makeRunQuery(authors);
