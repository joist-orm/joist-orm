import { taskItems } from "src/resolvers/taskItem/taskItemsQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("taskItems", () => {
  it.withCtx("returns taskItems", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(taskItems);
