import { tasks } from "src/resolvers/task/tasksQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("tasks", () => {
  it.withCtx("returns tasks", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(tasks);
