import { loadBatchLoader, referenceLoadOperation } from "src/batchloaders/loadBatchLoader.ts";
import type { Entity } from "src/Entity.ts";
import { type EntityManager, NotFoundError } from "src/EntityManager.ts";
import type { EntityMetadata } from "src/EntityMetadata.ts";
import { toTaggedId } from "src/keys.ts";

/** Loads a canonical reference target in a separate batch from caller-issued em.load requests. */
export async function loadReference<U extends Entity>(
  em: EntityManager,
  meta: EntityMetadata<U>,
  id: string,
): Promise<U> {
  const taggedId = toTaggedId(meta, id);
  let entity = em.findExistingInstance<U>(taggedId);
  if (!entity) {
    await loadBatchLoader(em, meta, false, referenceLoadOperation).load({ taggedId, hint: undefined });
    entity = em.findExistingInstance<U>(taggedId);
  }
  if (!entity) throw new NotFoundError(`${taggedId} was not found`);
  if (meta.inheritanceType === "sti" && !(entity instanceof meta.cstr)) {
    throw new Error(`${entity} is ${entity.constructor.name} but should be ${meta.cstr.name}`);
  }
  return entity;
}
