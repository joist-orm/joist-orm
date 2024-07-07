import { Entity } from "../Entity";
import { isCollection } from "./Collection";
import { isReference } from "./Reference";

export const RelationT = Symbol();
export const RelationU = Symbol();

/** A relationship from `T` to `U`, could be any of many-to-one, one-to-many, or many-to-many. */
export interface Relation<T extends Entity, U extends Entity> {
  // Make our Relation somewhat non-structural, otherwise since it's a marker interface,
  // types like `number` or `string` will match it. This also seems to nudge the type
  // inference inside of `LoadHint` to go beyond "this generic T of Entity has id and __orm"
  // to "no really this generic T has fields firstName, title, etc.".
  // See https://stackoverflow.com/questions/53448100/generic-type-of-extended-interface-not-inferred
  // And https://github.com/microsoft/TypeScript/issues/47213
  [RelationT]: T;
  [RelationU]: U;
  isLoaded: boolean;
  entity: Entity;
}

/** Type guard utility for determining if an entity field is a Relation. */
export function isRelation(maybeRelation: any): maybeRelation is Relation<any, any> {
  return isReference(maybeRelation) || isCollection(maybeRelation);
}
