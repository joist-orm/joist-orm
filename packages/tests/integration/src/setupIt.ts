import { expect } from "@jest/globals";
import { Context } from "@src/context";

import { knex, newEntityManager } from "@src/testEm";
import { Temporal } from "temporal-polyfill";

type itWithCtxFn = (ctx: Context) => Promise<void>;

it.withCtx = (name: string, fnOrOpts: itWithCtxFn | ContextOpts, maybeFn?: itWithCtxFn) => {
  const fn: itWithCtxFn = typeof fnOrOpts === "function" ? fnOrOpts : maybeFn!;
  it(name, async () => fn({ em: newEntityManager(), knex, makeApiCall: async () => {} }));
};

export function areTemporalsEqual(a: unknown, b: unknown) {
  if (a instanceof Temporal.ZonedDateTime && b instanceof Temporal.ZonedDateTime) return a.equals(b);
  if (a instanceof Temporal.PlainDateTime && b instanceof Temporal.PlainDateTime) return a.equals(b);
  if (a instanceof Temporal.PlainDate && b instanceof Temporal.PlainDate) return a.equals(b);
  return undefined;
}

expect.addEqualityTesters([areTemporalsEqual]);
