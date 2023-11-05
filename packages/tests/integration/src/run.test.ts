import { Context } from "@src/context";
import { run } from "joist-test-utils";

describe("run", () => {
  it.withCtx("does not loop with classes", async (ctx) => {
    class Foo {
      constructor(private ctx: Context) {}
    }
    await run(ctx, () => {
      return { foo: new Foo(ctx) };
    });
  });
});
