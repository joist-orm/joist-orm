import { newAuthorSchedule } from "src/entities";
import { authorScheduleResolvers } from "src/resolvers/authorSchedule/authorScheduleResolvers";
import { makeRunObjectField, makeRunObjectFields } from "src/resolvers/testUtils";

describe("authorScheduleResolvers", () => {
  it.withCtx("can return", async (ctx) => {
    const { em } = ctx;
    // Given a Author schedule
    const authorSchedule = newAuthorSchedule(em);
    // Then we can query it
    const result = await runFields(ctx, authorSchedule, ["overview", "createdAt", "updatedAt"]);
    expect(result).toMatchEntity({});
  });
});

const runFields = makeRunObjectFields(authorScheduleResolvers);
const runField = makeRunObjectField(authorScheduleResolvers);
