import { Entity, IdOf, OptsOf } from "./EntityManager";

/** Exposes a field's changed/original value in each entity's `this.changes` property. */
export interface FieldStatus<T> {
  hasChanged: boolean;
  originalValue?: T;
}

type NullOrDefinedOr<T> = T | null | undefined;
type ExcludeNever<T> = Pick<T, { [P in keyof T]: T[P] extends never ? never : P }[keyof T]>;

/**
 * Creates the `this.changes.firstName` changes API for a given entity `T`.
 *
 * Specifically we use the fields from OptsOf but:
 *
 * - Exclude collections
 * - Convert entity types to id types to match what is stored in originalData
 */
export type Changes<T extends Entity> = ExcludeNever<
  {
    [P in keyof OptsOf<T>]-?: OptsOf<T>[P] extends NullOrDefinedOr<infer U>
      ? U extends Array<any>
        ? never
        : U extends Entity
        ? FieldStatus<IdOf<U>>
        : FieldStatus<U>
      : never;
  }
>;

export function newChangesProxy<T extends Entity>(entity: T): Changes<T> {
  return new Proxy(entity, {
    get(target, p: PropertyKey): FieldStatus<any> {
      const originalValue = typeof p === "string" && entity.__orm.originalData[p];
      const hasChanged = typeof p === "string" && p in entity.__orm.originalData && entity.id !== undefined;
      return { hasChanged, originalValue };
    },
  }) as any;
}
