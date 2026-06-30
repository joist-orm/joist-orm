import { newTaskNew } from "src/entities";
import { taskNew } from "src/resolvers/taskNew/taskNewQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("taskNew", () => {
  it.withCtx("returns a Task new", async (ctx) => {
    const task = newTaskNew(ctx.em);
    const result = await run(ctx, () => ({ id: task.id }));
    expect(result).toMatchEntity(task);
  });
});

const run = makeRunQuery(taskNew);
