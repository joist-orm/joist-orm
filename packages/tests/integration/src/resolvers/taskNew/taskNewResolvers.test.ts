import { newTaskNew } from "src/entities";
import { taskNewResolvers } from "src/resolvers/taskNew/taskNewResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("taskNewResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Task new
    const task = newTaskNew(em);
    // Then we can query it
    const result = await runFields(ctx, task, ["specialNewField"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(taskNewResolvers);
const runField = makeRunObjectField(taskNewResolvers);
