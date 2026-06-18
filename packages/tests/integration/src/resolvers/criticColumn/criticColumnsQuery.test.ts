import { criticColumns } from "src/resolvers/criticColumn/criticColumnsQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("criticColumns", () => {
  it.withCtx("returns criticColumns", async (ctx) => {
    const result = await run(ctx);
    expect(result).toBeDefined();
  });
});

const run = makeRunQuery(criticColumns);
