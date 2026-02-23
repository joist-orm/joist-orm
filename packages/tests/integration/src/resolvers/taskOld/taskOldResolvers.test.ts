import { newTaskOld } from "src/entities";
import { taskOldResolvers } from "src/resolvers/taskOld/taskOldResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("taskOldResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Task old
    const task = newTaskOld(em);
    // Then we can query it
    const result = await runFields(ctx, task, ["specialOldField"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(taskOldResolvers);
const runField = makeRunObjectField(taskOldResolvers);
