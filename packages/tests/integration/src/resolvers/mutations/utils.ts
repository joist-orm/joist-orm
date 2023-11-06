import { Context } from "@src/context";
import { DeepPartialOrNull, Entity, EntityConstructor, IdOf } from "joist-orm";

export async function saveEntities<T extends Entity>(
  ctx: Context,
  type: EntityConstructor<T>,
  input: DeepPartialOrNull<T>[],
): Promise<IdOf<T>[]> {
  return [];
}
