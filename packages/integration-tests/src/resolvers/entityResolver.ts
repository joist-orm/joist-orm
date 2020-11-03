import { Entity, EntityMetadata } from "joist-orm";

export function entityResolver<T extends Entity>(entityMetadata: EntityMetadata<T>): any {}
