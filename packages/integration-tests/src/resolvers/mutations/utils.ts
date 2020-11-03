import { Context } from "@src/context";
import { BaseEntity, DeepPartialOrNull, EntityConstructor, IdOf } from "joist-orm";

export async function saveEntities<T extends BaseEntity>(
  ctx: Context,
  type: EntityConstructor<T>,
  input: DeepPartialOrNull<T>[],
): Promise<IdOf<T>[]> {
  return [];
}
