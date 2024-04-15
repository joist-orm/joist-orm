import { Context } from "@src/context";

import { knex, newEntityManager } from "@src/testEm";

type itWithCtxFn = (ctx: Context) => Promise<void>;

it.withCtx = (name: string, fnOrOpts: itWithCtxFn | ContextOpts, maybeFn?: itWithCtxFn) => {
  const fn: itWithCtxFn = typeof fnOrOpts === "function" ? fnOrOpts : maybeFn!;
  it(name, async () => fn({ em: newEntityManager(), knex, makeApiCall: async () => {} }));
};
