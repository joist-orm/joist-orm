import { run } from "joist-test-utils";
import { Context } from "src/context";
import { Author, newAuthor } from "src/entities";

import { jan1, jan2 } from "./testDates";

describe("run", () => {
  it.withCtx("does not loop with classes", async (ctx) => {
    class Foo {
      constructor(private ctx: Context) {}
    }
    await run(ctx, () => {
      return { foo: new Foo(ctx) };
    });
  });

  it.withCtx("mirrors an inserted date back as a date", async (ctx) => {
    // When a `run` inserts a row with a date
    const a1 = await run(ctx, async (ctx) => {
      const a1 = ctx.em.create(Author, { firstName: "a1", graduated: jan1 });
      await ctx.em.flush();
      return a1;
    });
    // Then the test em sees a Date, and not the ISO string we sent to the driver
    expect(a1.graduated).toEqual(jan1);
  });

  it.withCtx("mirrors an updated date back as a date", async (ctx) => {
    // Given an author that graduated jan1
    const a1 = newAuthor(ctx.em, { graduated: jan1 });

    // When a `run` moves it to jan2
    await run(ctx, async (ctx) => {
      const a = await ctx.em.load(Author, a1.idTagged);
      a.graduated = jan2;
      await ctx.em.flush();
    });

    // Then the test em sees a Date, and not the ISO string we sent to the driver
    expect(a1.graduated).toEqual(jan2);
  });
});
