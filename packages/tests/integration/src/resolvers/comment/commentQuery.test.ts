import { newComment } from "src/entities";
import { comment } from "src/resolvers/comment/commentQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("comment", () => {
  it.withCtx("returns a Comment", async (ctx) => {
    const comment = newComment(ctx.em);
    const result = await run(ctx, () => ({ id: comment.id }));
    expect(result).toMatchEntity(comment);
  });
});

const run = makeRunQuery(comment);
