import { EntityManager, isEntity } from "joist-orm";
import { fail } from "joist-utils";
import { Context } from "./context";
import { RunPlugin } from "./RunPlugin";

type MaybePromise<T> = T | Promise<T>;

export type ContextFn<C> = (ctx: C) => MaybePromise<C>;

/** Runs the `fn` in a dedicated / non-test Unit of Work . */
export async function run<C extends Context, T>(
  ctx: C,
  fn: (ctx: C) => MaybePromise<T>,
  contextFn: ContextFn<C> = newContext,
): Promise<T> {
  const { em } = ctx;
  // Ensure any test data we've setup is flushed
  await em.flush();
  const newCtx = await contextFn(ctx);
  const plugin = new RunPlugin(em);
  newCtx.em.addPlugin(plugin);
  const result = await fn(newCtx);
  // We expect `fn` (i.e. a resolver) to do its own UoW management, so don't flush.
  return mapResultToOriginalEm(em, result);
}

/** Creates a `run` with a custom `newContext` method. */
export function makeRun<C extends Context>(
  contextFn: ContextFn<C>,
): <T>(ctx: C, fn: (ctx: C) => MaybePromise<T>) => Promise<T> {
  return (ctx, fn) => run(ctx, fn, contextFn);
}

/** Runs the `fn` in a dedicated / non-test Unit of Work for each value in `values */
export async function runEach<C extends Context, T, U>(
  ctx: C,
  valuesFn: () => U[],
  fn: (ctx: C, value: U) => MaybePromise<T>,
  contextFn: ContextFn<C> = newContext,
): Promise<T[]> {
  const { em } = ctx;
  // Ensure any test data we've setup is flushed
  await em.flush();
  const plugin = new RunPlugin(em);
  const results = await Promise.all(
    valuesFn().map(async (value) => {
      const newCtx = await contextFn(ctx);
      newCtx.em.addPlugin(plugin);
      return fn(newCtx, value);
    }),
  );
  return mapResultToOriginalEm(em, results);
}

/** Creates a `runEach` with a custom `newContext` method. */
export function makeRunEach<C extends Context>(
  contextFn: ContextFn<C>,
): <T, U>(ctx: C, valuesFn: () => U[], fn: (ctx: C, value: U) => MaybePromise<T>) => Promise<T[]> {
  return (ctx, valuesFn, fn) => runEach(ctx, valuesFn, fn, contextFn);
}

/** A default `newContext` that assumes `ctx.em` is where the `EntityManager` lives. */
export function newContext<C extends Context>(ctx: C): C {
  const { em } = ctx;
  const newCtx = { ...ctx };
  const newEm = new EntityManager(newCtx, em.driver);
  Object.assign(newCtx, { em: newEm });
  return newCtx;
}

function mapResultToOriginalEm<R>(em: EntityManager, result: R): R {
  // generate a cache of id -> entity in original em
  if (isEntity(result)) {
    return (em.findExistingInstance(result.idTagged) ?? fail(`Could not find entity ${result.idTagged}`)) as R;
  } else if (Array.isArray(result)) {
    return result.map((r) => mapResultToOriginalEm(em, r)) as any;
  } else if (result instanceof Map) {
    const map = new Map<any, any>();
    result
      .entries()
      .forEach(([key, value]) => map.set(mapResultToOriginalEm(em, key), mapResultToOriginalEm(em, value)));
    return map as R;
  } else if (result instanceof Set) {
    const set = new Set<any>();
    result.forEach((r) => set.add(mapResultToOriginalEm(em, r)));
    return set as R;
  } else if (typeof result === "object" && result?.constructor === Object) {
    const obj = {} as any;
    Object.entries(result).forEach(([key, value]: [string, any]) => (obj[key] = mapResultToOriginalEm(em, value)));
    return obj;
  } else {
    return result;
  }
}
