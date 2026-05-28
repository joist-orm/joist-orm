import { authorSchedules } from "src/resolvers/authorSchedule/authorSchedulesQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("authorSchedules", () => {
  it.withCtx("returns authorSchedules", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(authorSchedules);
