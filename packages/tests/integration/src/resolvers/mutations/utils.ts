import { Context } from "@src/context";
import { DeepPartialOrNull, Entity, EntityConstructor } from "joist-orm";

export async function saveEntities<T extends Entity>(
  ctx: Context,
  type: EntityConstructor<T>,
  inputs: DeepPartialOrNull<T>[],
): Promise<T[]> {
  return await Promise.all(inputs.map((input) => ctx.em.createOrUpdatePartial(type, input)));
}
