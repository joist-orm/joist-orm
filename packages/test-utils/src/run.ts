import { Entity, EntityManager, isEntity } from "joist-orm";
import { Context } from "./context";

type MaybePromise<T> = T | Promise<T>;

/** Runs the `fn` in a dedicated / non-test Unit of Work . */
export async function run<C extends Context, T>(ctx: C, fn: (ctx: C) => MaybePromise<T>): Promise<T> {
  const { em } = ctx;
  // Ensure any test data we've setup is flushed
  await em.flush();
  const result = await runWithNewCtx(ctx, fn);
  // We expect `fn` (i.e. a resolver) to do its own UoW management, so don't flush.
  await em.refresh({ deepLoad: true });
  return mapResultToOriginalEm(em, result);
}

/** Runs the `fn` in a dedicated / non-test Unit of Work for each value in `values */
export async function runEach<C extends Context, T, U>(
  ctx: C,
  valuesFn: () => U[],
  fn: (ctx: C, value: U) => MaybePromise<T>,
): Promise<T[]> {
  const { em } = ctx;
  // Ensure any test data we've setup is flushed
  await em.flush();
  const results = await Promise.all(valuesFn().map((value) => runWithNewCtx(ctx, (ctx) => fn(ctx, value))));
  // We expect `fn` (i.e. a resolver) to do its own UoW management, so don't flush.
  await em.refresh({ deepLoad: true });
  return mapResultToOriginalEm(em, results);
}

/** Runs the `fn` in a dedicated / non-test Unit of Work. */
async function runWithNewCtx<C extends Context, T>(ctx: C, fn: (ctx: C) => MaybePromise<T>): Promise<T> {
  const { em } = ctx;
  const newCtx = { ...ctx };
  const newEm = new EntityManager(newCtx, em.driver);
  return fn(newCtx);
}

function gatherEntities(result: any): Entity[] {
  if (isEntity(result)) {
    return [result];
  } else if (Array.isArray(result)) {
    return result.flatMap(gatherEntities);
  } else if (result !== null && typeof result === "object") {
    return Object.values(result).flatMap(gatherEntities);
  } else {
    return [];
  }
}

async function mapResultToOriginalEm<R>(em: EntityManager, result: R): Promise<R> {
  const newEmEntities = gatherEntities(result);
  // load any entities that don't exist in the original em
  await Promise.all(newEmEntities.filter((e) => !em.findExistingInstance(e.idOrFail)).map((e) => em.load(e.idOrFail)));
  // generate a cache of id -> entity in original em
  const cache = Object.fromEntries(
    newEmEntities.map((e) => [e.idOrFail, em.findExistingInstance(e.idOrFail) as Entity]),
  );
  function doMap(value: any): any {
    if (isEntity(value)) {
      return cache[value.idOrFail];
    } else if (Array.isArray(value)) {
      return value.map(doMap) as any;
    } else if (typeof value === "object" && value?.constructor === Object) {
      return Object.fromEntries(Object.entries(value).map(([key, value]: [string, any]) => [key, doMap(value)]));
    } else {
      return value;
    }
  }
  return doMap(result);
}
