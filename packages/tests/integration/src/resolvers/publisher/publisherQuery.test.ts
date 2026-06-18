import { newPublisher } from "src/entities";
import { publisher } from "src/resolvers/publisher/publisherQuery";
import { makeRunQuery } from "src/resolvers/testUtils";

describe("publisher", () => {
  it.withCtx("returns a Publisher", async (ctx) => {
    const p = newPublisher(ctx.em, { authors: [{}] });
    const result = await run(ctx, () => ({ id: p.id }));
    expect(result).toMatchEntity(p);
  });
});

const run = makeRunQuery(publisher);
