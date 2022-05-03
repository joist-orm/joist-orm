import { Context } from "src/context";
import { SaveAuthorStatInput } from "src/generated/graphql-types";
import { saveAuthorStat } from "src/resolvers/mutations/authorStat/saveAuthorStatResolver";
import { run } from "src/resolvers/testUtils";
import "src/setupDbTests";

describe("saveAuthorStat", () => {
  it.withCtx("can create", async (ctx) => {
    const { em } = ctx;
    const result = await runSaveAuthorStat(ctx, () => ({}));
    expect(result).toBeDefined();
  });
});

function runSaveAuthorStat(ctx: Context, inputFn: () => SaveAuthorStatInput) {
  return run(ctx, (ctx) => saveAuthorStat.saveAuthorStat({}, { input: inputFn() }, ctx, undefined!));
}
