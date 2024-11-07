import { DeepPartialOrNull, Entity, EntityConstructor, OptsOf } from "joist-orm";
import { failIfAnyRejected } from "joist-orm/build/utils";
import { Context } from "joist-test-utils";

/** Given an GraphQL input, creates-or-updates an entity of `type`. */
export async function saveEntity<T extends Entity>(
  ctx: Context,
  type: EntityConstructor<T>,
  input: DeepPartialOrNull<T>,
  opts: { flush?: boolean } = {},
): Promise<T> {
  return saveEntities(ctx, type, [input], opts).then((r) => r[0]);
}

/** Given GraphQL inputs, creates-or-updates multiple entities of `type`. */
export async function saveEntities<T extends Entity>(
  ctx: Context,
  type: EntityConstructor<T>,
  input: readonly DeepPartialOrNull<T>[],
  opts: { flush?: boolean; opts?: Partial<OptsOf<T>> } = {},
): Promise<T[]> {
  const { em } = ctx;
  const { opts: entityOpts = {}, flush = true } = opts;
  const results = await Promise.allSettled(
    input.map((input) => em.createOrUpdatePartial(type, { ...entityOpts, ...input })),
  );
  if (flush) {
    await ctx.em.flush();
  }
  return failIfAnyRejected(results);
}
