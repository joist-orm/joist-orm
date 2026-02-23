import { saveAuthorStat } from "src/resolvers/authorStat/saveAuthorStatMutation";
import { makeRunInputMutation } from "src/resolvers/testUtils";

describe("saveAuthorStat", () => {
  it.withCtx("can create", async (ctx) => {
    const result = await runSave(ctx, () => ({
      smallint: 1,
      integer: 1,
      bigint: 1n,
      decimal: 1.0,
      real: 1.0,
      doublePrecision: 1.0,
      smallserial: 1,
      serial: 1,
      bigserial: 1n
    }));
    expect(result).toBeDefined();
  });
});

const runSave = makeRunInputMutation(saveAuthorStat);
