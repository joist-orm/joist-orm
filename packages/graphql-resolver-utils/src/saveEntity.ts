import {
  type DeepPartialOrNull,
  type Entity,
  type EntityConstructor,
  type OptsOf,
  failIfAnyRejected,
} from "joist-core";
import { type Context } from "joist-test-utils";

/** Creates or updates an entity from GraphQL input, flushing by default. */
export async function saveEntity<T extends Entity>(
  ctx: Context,
  type: EntityConstructor<T>,
  input: DeepPartialOrNull<T>,
  opts: { flush?: boolean } = {},
): Promise<T> {
  return saveEntities(ctx, type, [input], opts).then((r) => r[0]);
}

/**
 * Creates or updates multiple entities from GraphQL inputs, flushing by default.
 *
 * A rejected upsert skips the flush but does not undo pending changes in the EntityManager.
 */
export async function saveEntities<T extends Entity>(
  ctx: Context,
  type: EntityConstructor<T>,
  input: readonly DeepPartialOrNull<T>[],
  opts: { flush?: boolean; opts?: Partial<OptsOf<T>> } = {},
): Promise<T[]> {
  const { em } = ctx;
  const { opts: entityOpts = {}, flush = true } = opts;
  const results = await Promise.allSettled(input.map((input) => em.upsert(type, { ...entityOpts, ...input })));
  const entities = failIfAnyRejected(results);
  if (flush) {
    await em.flush();
  }
  return entities;
}
