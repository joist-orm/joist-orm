import { Entity } from "./EntityManager";

export interface Reference<T extends Entity, U extends Entity> {
  load(): Promise<U>;

  set(other: U): void;
}

export interface Collection<T extends Entity, U extends Entity> {
  load(): Promise<U[]>;

  add(other: U): void;
}
