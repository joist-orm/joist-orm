import { newTask } from "src/entities";
import { taskResolvers } from "src/resolvers/task/taskResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("taskResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Task
    const task = newTask(em);
    // Then we can query it
    const result = await runFields(ctx, task, [
      "durationInDays",
      "deletedAt",
      "syncDefault",
      "asyncDefault_1",
      "asyncDefault_2",
      "syncDerived",
      "asyncDerived",
      "createdAt",
      "updatedAt",
    ]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(taskResolvers);
const runField = makeRunObjectField(taskResolvers);
