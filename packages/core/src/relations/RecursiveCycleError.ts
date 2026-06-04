import { Entity } from "../Entity";

interface RecursiveCycleRelation {
  entity: Entity;
  fieldName: string;
}

/** Indicates a recursive relation/property cycle that cannot be safely evaluated. */
export class RecursiveCycleError extends Error {
  readonly fieldName: string;
  entities: Entity[] = [];

  constructor(relation: RecursiveCycleRelation, entities: Entity[]) {
    super(`Cycle detected in ${relation.entity.toString()}.${relation.fieldName}`);
    this.fieldName = relation.fieldName;
    this.entities = entities;
  }
}
