import { Context } from "@src/context";
import { DeepPartialOrNull, Entity, EntityConstructor } from "joist-orm";

export async function saveEntities<T extends Entity>(
  ctx: Context,
  type: EntityConstructor<T>,
  inputs: DeepPartialOrNull<T>[],
  opts: {
    flush?: boolean;
  } = {},
): Promise<T[]> {
  const { flush = true } = opts;
  const entities = await Promise.all(inputs.map((input) => ctx.em.createOrUpdatePartial(type, input)));
  if (flush) await ctx.em.flush();
  return entities;
}
