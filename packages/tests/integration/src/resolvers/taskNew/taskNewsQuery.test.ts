import { taskNews } from "src/resolvers/taskNew/taskNewsQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("taskNews", () => {
  it.withCtx("returns taskNews", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(taskNews);
