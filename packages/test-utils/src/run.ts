import { Entity, EntityManager, isEntity, RunRefreshPlugin } from "joist-orm";
import { fail } from "joist-utils";
import { Context } from "./context";

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
  const plugin = new RunRefreshPlugin();
  newCtx.em.addPlugin(plugin);
  const result = await fn(newCtx);
  // We expect `fn` (i.e. a resolver) to do its own UoW management, so don't flush.
  await plugin.refresh(em);
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
  const results = await Promise.all(valuesFn().map(async (value) => fn(await contextFn(ctx), value)));
  // We expect `fn` (i.e. a resolver) to do its own UoW management, so don't flush.
  await em.refresh({ deepLoad: true });
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

function gatherEntities(result: any): Entity[] {
  if (isEntity(result)) {
    return [result];
  } else if (Array.isArray(result)) {
    return result.flatMap(gatherEntities);
  } else if (result instanceof Map) {
    return [...result.values(), ...result.keys()].flatMap(gatherEntities);
  } else if (result !== null && typeof result === "object" && result?.constructor === Object) {
    return Object.values(result).flatMap(gatherEntities);
  } else {
    return [];
  }
}

async function mapResultToOriginalEm<R>(em: EntityManager, result: R): Promise<R> {
  const newEmEntities = gatherEntities(result);
  // load any entities that don't exist in the original em
  await Promise.all(
    newEmEntities
      .filter(
        (e) =>
          !em.findExistingInstance(
            e.idTaggedMaybe ?? fail("Joist 'run' returned an unsaved entity; are you missing an em.flush?"),
          ),
      )
      .map((e) => em.load(e.idTagged)),
  );
  // generate a cache of id -> entity in original em
  const cache = Object.fromEntries(newEmEntities.map((e) => [e.id, em.findExistingInstance(e.idTagged) as Entity]));
  function doMap(value: any): any {
    if (isEntity(value)) {
      return cache[value.id];
    } else if (Array.isArray(value)) {
      return value.map(doMap) as any;
    } else if (value instanceof Map) {
      return new Map<any, any>([...value.entries()].map(([key, value]) => [doMap(key), doMap(value)]));
    } else if (typeof value === "object" && value?.constructor === Object) {
      return Object.fromEntries(Object.entries(value).map(([key, value]: [string, any]) => [key, doMap(value)]));
    } else {
      return value;
    }
  }
  return doMap(result);
}
