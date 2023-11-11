import { Context } from "@src/context";

import { inMemory, knex, newEntityManager } from "@src/testEm";

type itWithCtxFn = (ctx: Context) => Promise<void>;

it.withCtx = (name: string, fnOrOpts: itWithCtxFn | ContextOpts, maybeFn?: itWithCtxFn) => {
  const fn: itWithCtxFn = typeof fnOrOpts === "function" ? fnOrOpts : maybeFn!;
  it(name, async () => fn({ em: newEntityManager(), knex, makeApiCall: async () => {} }));
};

it.unlessInMemory = Object.assign(
  (name: string, fn: any) => {
    // Ideally we'd check the testDriver, but it's not initialized until beforeAll runs
    if (inMemory) {
      it.skip(name, () => {});
    } else {
      it(name, fn);
    }
  },
  {
    withCtx(name: string, fnOrOpts: itWithCtxFn | ContextOpts, maybeFn?: itWithCtxFn) {
      if (inMemory) {
        it.skip(name, () => {});
      } else {
        (it.withCtx as any)(name, fnOrOpts, maybeFn);
      }
    },
  },
);
