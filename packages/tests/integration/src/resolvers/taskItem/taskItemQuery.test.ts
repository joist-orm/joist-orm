import { newTaskItem } from "src/entities";
import { taskItem } from "src/resolvers/taskItem/taskItemQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("taskItem", () => {
  it.withCtx("returns a Task item", async (ctx) => {
    const ti = newTaskItem(ctx.em);
    const result = await run(ctx, () => ({ id: ti.id }));
    expect(result).toMatchEntity(ti);
  });
});

const run = makeRunQuery(taskItem);
