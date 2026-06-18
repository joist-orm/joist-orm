import { newTask } from "src/entities";
import { task } from "src/resolvers/task/taskQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("task", () => {
  it.withCtx("returns a Task", async (ctx) => {
    const task = newTask(ctx.em);
    const result = await run(ctx, () => ({ id: task.id }));
    expect(result).toMatchEntity(task);
  });
});

const run = makeRunQuery(task);
