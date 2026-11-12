import type { Entity } from "src/Entity.ts";
import { getEmInternalApi } from "src/EntityManager.ts";
import { getMetadata } from "src/EntityMetadata.ts";
import { isInTrustedContext } from "src/trusted.ts";

/** Projects a plugin-aware collection without changing its canonical membership. */
export function filterVisible<U extends Entity>(entity: Entity, field: string, values: readonly U[]): U[] {
  if (isInTrustedContext()) return values as U[];
  const plugins = getEmInternalApi(entity.em).pluginManager;
  plugins.beforeGetField(entity, field);
  let visible: U[] | undefined;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (plugins.canViewEntity(value)) {
      visible?.push(value);
    } else {
      // Keep the original array unless visibility actually removes a member.
      visible ??= values.slice(0, i);
    }
  }
  return visible ?? (values as U[]);
}

/** Checks field access and target visibility before returning a referenced entity. */
export function checkVisibleReference<V extends Entity | undefined>(entity: Entity, field: string, value: V): V {
  if (isInTrustedContext()) return value;
  const plugins = getEmInternalApi(entity.em).pluginManager;
  plugins.beforeGetField(entity, field);
  if (value === undefined) return value;
  checkVisibleTarget(entity, field, value);
  return value;
}

/** Replaces the public membership while retaining invisible members in canonical state. */
export function replaceVisible<U extends Entity>(
  entity: Entity,
  field: string,
  values: readonly U[],
  current: () => readonly U[],
): readonly U[] {
  const plugins = getEmInternalApi(entity.em).pluginManager;
  if (!isInTrustedContext()) plugins.beforeGetField(entity, field);
  plugins.beforeSetField(entity, field, values);
  if (isInTrustedContext()) return values;
  for (const value of values) checkVisibleTarget(entity, field, value);
  return [...values, ...current().filter((value) => !plugins.canViewEntity(value) && !values.includes(value))];
}

/** Checks explicit join edits, leaving inverse percolation to canonical bookkeeping. */
export function checkVisibleMutation(entity: Entity, field: string, value: Entity): void {
  getEmInternalApi(entity.em).pluginManager.beforeSetField(entity, field, value);
  if (isInTrustedContext()) return;
  checkVisibleTarget(entity, field, value);
}

/** Target visibility is independent of permission to read the owner's relationship field. */
function checkVisibleTarget(entity: Entity, field: string, target: Entity): void {
  if (!getEmInternalApi(entity.em).pluginManager.canViewEntity(target)) {
    throw new Error(`No read permission for ${getMetadata(entity).type}.${field} target`);
  }
}
