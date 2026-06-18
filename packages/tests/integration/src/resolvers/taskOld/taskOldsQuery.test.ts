import { taskOlds } from "src/resolvers/taskOld/taskOldsQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("taskOlds", () => {
  it.withCtx("returns taskOlds", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(taskOlds);
