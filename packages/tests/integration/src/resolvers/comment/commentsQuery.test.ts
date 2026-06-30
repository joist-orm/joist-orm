import { comments } from "src/resolvers/comment/commentsQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("comments", () => {
  it.withCtx("returns comments", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(comments);
