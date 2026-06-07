import { newTaskOld } from "src/entities";
import { taskOld } from "src/resolvers/taskOld/taskOldQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("taskOld", () => {
  it.withCtx("returns a Task old", async (ctx) => {
    const task = newTaskOld(ctx.em);
    const result = await run(ctx, () => ({ id: task.id }));
    expect(result).toMatchEntity(task);
  });
});

const run = makeRunQuery(taskOld);
