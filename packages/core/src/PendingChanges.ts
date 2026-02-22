import { Entity } from "./Entity";

/** A new entity that hasn't been flushed yet. */
export interface PendingCreate {
  kind: "create";
  entity: Entity;
}

/** An existing entity with dirty fields or that was touched. */
export interface PendingUpdate {
  kind: "update";
  entity: Entity;
}

/** An entity marked for deletion. */
export interface PendingDelete {
  kind: "delete";
  entity: Entity;
}

/** A many-to-many join row being added or removed. */
export interface PendingM2M {
  kind: "m2m";
  op: "add" | "remove";
  joinTableName: string;
  entities: [Entity, Entity];
}

/** A discriminated union of all pending changes tracked by the EntityManager. */
export type PendingChange = PendingCreate | PendingUpdate | PendingDelete | PendingM2M;
