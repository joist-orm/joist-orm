import { newAuthorSchedule } from "src/entities";
import { authorSchedule } from "src/resolvers/authorSchedule/authorScheduleQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("authorSchedule", () => {
  it.withCtx("returns a Author schedule", async (ctx) => {
    const authorSchedule = newAuthorSchedule(ctx.em);
    const result = await run(ctx, () => ({ id: authorSchedule.id }));
    expect(result).toMatchEntity(authorSchedule);
  });
});

const run = makeRunQuery(authorSchedule);
