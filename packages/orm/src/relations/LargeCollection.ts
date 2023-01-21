import { Entity } from "../Entity";
import { IdOf } from "../EntityManager";
import { Relation } from "./Relation";

/**
 * A large collection of `U` within `T`, where the parent has so many children
 * that we cannot load them all at a single time.
 *
 * We consider this a `Relation`, but not a true `Collection` b/c it cannot be
 * loaded.
 */
export interface LargeCollection<U extends Entity> extends Relation<U> {
  /** Looks up the specific `id` without fully loading the collection. */
  find(id: IdOf<U>): Promise<U | undefined>;

  /** Looks up the specific `other` without fully loading the collection. */
  includes(other: U): Promise<boolean>;

  add(other: U): void;

  remove(other: U): void;
}
