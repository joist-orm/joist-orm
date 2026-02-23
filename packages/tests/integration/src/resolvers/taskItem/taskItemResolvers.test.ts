import { newTaskItem } from "src/entities";
import { taskItemResolvers } from "src/resolvers/taskItem/taskItemResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("taskItemResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Task item
    const ti = newTaskItem(em);
    // Then we can query it
    const result = await runFields(ctx, ti, ["createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(taskItemResolvers);
const runField = makeRunObjectField(taskItemResolvers);
